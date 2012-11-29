#!/usr/bin/perl

=pod

Internet users per country and population per country available from world bank here:
 http://databank.worldbank.org/Data/Views/VariableSelection/SelectVariables.aspx?source=World%20Development%20Indicators%20and%20Global%20Development%20Finance#

API access as follows:
http://api.worldbank.org/countries/all/indicators/SP.POP.TOTL?MRV=1&per_page=500&format=json
http://api.worldbank.org/countries/all/indicators/IT.NET.USER.P2?MRV=1&per_page=500&format=json


Internet users and population per US State come from here:

http://www.internetworldstats.com/stats26.htm


UK population per county from here:

http://en.wikipedia.org/wiki/List_of_English_counties

Also available in more detail here:

http://www.ons.gov.uk/ons/publications/re-reference-tables.html?edition=tcm%3A77-257414
http://www.ons.gov.uk/ons/rel/census/2011-census/population-and-household-estimates-for-england-and-wales/rft-p04.xls

=cut

use strict;
use warnings;
use MongoDB;
use Tie::IxHash;
use JSON;
use Getopt::Std;
use Data::Dumper;
use LWP;
use IO::Uncompress::AnyUncompress qw(anyuncompress $AnyUncompressError);
use FindBin qw($Bin);
use File::Slurp;

# change dir to the location of the script
chdir($Bin);

# autoflush output
local $| = 1;

my $debug = 0;

my $countryfile = 'countryInfo.txt';
my $admin1file = 'admin1CodesASCII.txt';
my $admin2file = 'admin2Codes.txt';
my $countryPopulations = 'countryPopulations.json';
my $countryInternet = 'countryInternet.json';
my $usStates = 'USStates.csv';
my $ukCounties = 'GB.txt';

my %filelocations = ( 
		'countryInfo.txt' => 'http://download.geonames.org/export/dump/countryInfo.txt',
		'admin1CodesASCII.txt' => 'http://download.geonames.org/export/dump/admin1CodesASCII.txt',
		'admin2Codes.txt' => 'http://download.geonames.org/export/dump/admin2Codes.txt',
		'countryPopulations.json' => 'http://api.worldbank.org/countries/all/indicators/SP.POP.TOTL?MRV=1&per_page=500&format=json',
		'countryInternet.json' => 'http://api.worldbank.org/countries/all/indicators/IT.NET.USER.P2?MRV=1&per_page=500&format=json'
	);

my %opts;
getopts('h:u:p:', \%opts);
my %conndetails;
$conndetails{'host'} = $opts{'h'} ? $opts{'h'} : 'localhost';
$conndetails{'username'} = $opts{'u'} if ($opts{'u'});
$conndetails{'password'} = $opts{'p'} if ($opts{'p'});

sub download_files {
	foreach my $filename (keys(%filelocations)) {
		if (!-f $filename) {
			my $downloadfile = $filelocations{$filename};
			$downloadfile =~ s|^.*/||;
			print "Downloading file $filename as $downloadfile from $filelocations{$filename}\n";
			open(FILE, ">$downloadfile") || die "Could not write to $downloadfile";
			my $ua = LWP::UserAgent->new;
			$ua->timeout(10);
			$ua->env_proxy;
			my $response = $ua->get($filelocations{$filename});
			if ($response->is_success) {
				print FILE $response->content;
				close FILE;
				if ($downloadfile ne $filename) {
					print "Uncompressing $downloadfile to $filename\n";
					anyuncompress $downloadfile => $filename or die "anyuncompress failed: $AnyUncompressError\n";
					unlink $downloadfile;
				}
			}
			else {
				die $response->status_line;
			}
		}
	}
}

download_files();

print "Connecting to Mongo...\n";
my $conn = MongoDB::Connection->new(%conndetails);
my $db = $conn->geonames;

# Drop the old states collection in mongo
print "Dropping old states collection...\n";
$db->states->drop();
my $err = $db->last_error();
die $err if $err && !ref($err) && !(ref($err) eq "HASH" && $err->{ok} == 1);

# First read in country codes, names & languages lookup
print "Building country code to name lookup table...\n";
my %countrylookup;
open(FILE, "<$countryfile") or die "Can't open file $countryfile";
while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	my @p = split("\t", $line);
	$countrylookup{ $p[0] } = [ $p[4], [ split(",", $p[15]) ] ];
}
close FILE;
#print Dumper(%countrylookup);

# Now read in admin1codes & admin2codes lookups
print "Building admin code to name lookup tables...\n";
my (%admin1lookup, %admin2lookup, %usStateCodeLookup, %ukCountyCodeLookup);
open(FILE, "<$admin1file") or die "Can't open file $admin1file";
while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	my @p = split("\t", $line);
	$admin1lookup{ $p[0] } = $p[2];

	if ($p[0] =~ m/^US\./) {
		my $code = $p[0];
		$code =~ s/\./-/;
		$usStateCodeLookup{$p[2]} = $code;
	}
}
close FILE;
open(FILE, "<$admin2file") or die "Can't open file $admin2file";
while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	my @p = split("\t", $line);
	$admin2lookup{ $p[0] } = $p[1];

	if ($p[0] =~ m/^GB\./) {
		my $code = $p[0];
		$code =~ s/\.ENG\./-/;
		$ukCountyCodeLookup{$p[2]} = $code;
	}
}
close FILE;
#print Dumper(%admin1lookup);

print "Importing countries...\n";

# Read in the two country JSON files
my $popstr = File::Slurp::read_file($countryPopulations);
my $popData = decode_json $popstr;

my $intstr = File::Slurp::read_file($countryInternet);
my $intData = decode_json $intstr;

# Check we got all the data in both cases
die "Did not download complete data for population" unless $popData->[0]->{page} == 1 && $popData->[0]->{pages} == 1;
die "Did not download complete data for internet penetration" unless $intData->[0]->{page} == 1 && $intData->[0]->{pages} == 1;

# Map the data sources into one single hash
my $countries = {};
foreach my $datapoint (@{$popData->[1]}) {
	my $cid = $datapoint->{country}->{id};
	my $pop = $datapoint->{value} ? $datapoint->{value} * 1 : 0;
	if ($countrylookup{$cid}) {
		$countries->{$cid} = { Country => $countrylookup{$cid}->[0], Population => $pop };
	} else {
		print "Country code $cid not found in geonames countries lookup\n" if $debug;
	}
}
foreach my $datapoint (@{$intData->[1]}) {
	if ($datapoint->{value}) {
		my $cid = $datapoint->{country}->{id};
		my $pen = $datapoint->{value} * 1.00000000001;
		if ($countrylookup{$cid}) {
			$countries->{$cid}->{InternetPenetration} = $pen;
		} else {
			print "Country code $cid not found in geonames countries lookup\n" if $debug;
		}
	}
}

# Save the country data to the db
foreach my $id (keys(%$countries)) {
	my $doc = $countries->{$id};
	$doc->{_id} = $id;
	$db->states->save( $doc );
}

print "Importing US States...\n";

# Read in the State data and import to db
open(FILE, "<$usStates") or die "Can't open file $usStates";
my $headertxt = <FILE>;
my @headers = split(',', $headertxt);
my %headerpos = ();
for (my $i=0; $i< scalar(@headers); $i++) {
	$headerpos{$headers[$i]} = $i;
}

while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	next if $line =~ m/^\s*$/;
	
	my @p = split(',', $line);
	my $doc = {};
	
	my $state = $p[ $headerpos{State} ];
	$state = "Washington, D.C." if $state eq "District of Columbia";
	
	$doc->{_id} = $usStateCodeLookup{ $state };
	if (!$doc->{_id}) {
		print "Couldn't find state $state in state code lookup table.\n";
	}
	
	$doc->{Country} = 'United States';
	$doc->{StateOrCounty} = $state;
	$doc->{Population} = $p[ $headerpos{Population} ] * 1;
	
	my $pen = $p[ $headerpos{InternetPenetration} ];
	$pen =~ s/%$//;
	$doc->{InternetPenetration} = $pen * 1.00000000001;
	
	$db->states->save( $doc );
	print Dumper($doc) if $debug;
}
close FILE;

print "Importing UK Counties...\n";

# Read in the UK county data and build a lookup table
open(FILE, "<$ukCounties") or die "Can't open file $ukCounties";

@headers = ("Geonameid", "Name", "Asciiname", "Alternatenames", "Latitude", "Longitude", 
	"Feature_class", "Feature_code", "Country_code", "Cc2", "Admin1_code", "Admin2_code", 
	"Admin3_code", "Admin4_code", "Population", "Elevation", "Dem", "Timezone", "Modification_date");
my %headers;

for(my $i=0;$i<scalar(@headers);$i++) {
	#$headers[$i] = lc($headers[$i]);
	$headers{$headers[$i]} = $i;
}

my $countiesLookup = {};

while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	next if $line =~ m/^\s*$/;
	
	my @p = split("\t", $line);
	my $doc = {};
	$doc->{_id} = "$p[ $headers{Country_code} ]-$p[ $headers{Admin2_code} ]";
	$doc->{Country} = 'United Kingdom';
	$doc->{StateOrCounty} = $p[ $headers{Asciiname} ];
	$doc->{Population} = $p[ $headers{Population} ] * 1;
	# Couldn't find internet penetration by county for UK, so use same penetration as for whole country
	$doc->{InternetPenetration} = $countries->{GB}->{InternetPenetration};
	
	my $admin2code = "$p[ $headers{Country_code} ].$p[ $headers{Admin1_code} ].$p[ $headers{Admin2_code} ]";
	
	if ($admin2lookup{ $admin2code } && $admin2lookup{ $admin2code } eq $doc->{StateOrCounty}) {
		$db->states->save( $doc );
		print Dumper($admin2code, $doc) if $debug;
	}
}
close FILE;

print "Done.\n";

=pod

[{"page":1,"pages":50,"per_page":"5","total":246},[{"indicator":{"id":"IT.NET.USER.P2","value":"Internet users (per 100 people)"},"country":{"id":"1A","value":"Arab World"},"value":"30.8076705689111","decimal":"1","date":"2011"},{"indicator":{"id":"IT.NET.USER.P2","value":"Internet users (per 100 people)"},"country":{"id":"S3","value":"Caribbean small states"},"value":"41.7279292879378","decimal":"1","date":"2011"},{"indicator":{"id":"IT.NET.USER.P2","value":"Internet users (per 100 people)"},"country":{"id":"Z4","value":"East Asia & Pacific (all income levels)"},"value":"38.5524647184726","decimal":"1","date":"2011"},{"indicator":{"id":"IT.NET.USER.P2","value":"Internet users (per 100 people)"},"country":{"id":"4E","value":"East Asia & Pacific (developing only)"},"value":"33.604129491181","decimal":"1","date":"2011"},{"indicator":{"id":"IT.NET.USER.P2","value":"Internet users (per 100 people)"},"country":{"id":"XC","value":"Euro area"},"value":"72.9897661486445","decimal":"1","date":"2011"}]]

[{"page":1,"pages":50,"per_page":"5","total":246},[{"indicator":{"id":"SP.POP.TOTL","value":"Population, total"},"country":{"id":"1A","value":"Arab World"},"value":"354836030","decimal":"0","date":"2011"},{"indicator":{"id":"SP.POP.TOTL","value":"Population, total"},"country":{"id":"S3","value":"Caribbean small states"},"value":"6919403","decimal":"0","date":"2011"},{"indicator":{"id":"SP.POP.TOTL","value":"Population, total"},"country":{"id":"Z4","value":"East Asia & Pacific (all income levels)"},"value":"2216003701","decimal":"0","date":"2011"},{"indicator":{"id":"SP.POP.TOTL","value":"Population, total"},"country":{"id":"4E","value":"East Asia & Pacific (developing only)"},"value":"1974218593","decimal":"0","date":"2011"},{"indicator":{"id":"SP.POP.TOTL","value":"Population, total"},"country":{"id":"XC","value":"Euro area"},"value":"332990116","decimal":"0","date":"2011"}]]

=cut
