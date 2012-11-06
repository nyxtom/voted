#!/usr/bin/perl

# e.g. ./import-cities.pl -h localhost -u nuvicorp -p XXX

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

# change dir to the location of the script
chdir($Bin);

# autoflush output
local $| = 1;

my $cityfile = 'cities1000.txt';
my $countryfile = 'countryInfo.txt';
my $admin1file = 'admin1CodesASCII.txt';
my $admin2file = 'admin2Codes.txt';

my %filelocations = ( 
		'cities1000.txt' => 'http://download.geonames.org/export/dump/cities1000.zip',
		'countryInfo.txt' => 'http://download.geonames.org/export/dump/countryInfo.txt',
		'admin1CodesASCII.txt' => 'http://download.geonames.org/export/dump/admin1CodesASCII.txt',
		'admin2Codes.txt' => 'http://download.geonames.org/export/dump/admin2Codes.txt'
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

# Drop the old cities collection in mongo
print "Dropping old cities collection...\n";
$db->cities->drop();
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
my (%admin1lookup, %admin2lookup);
open(FILE, "<$admin1file") or die "Can't open file $admin1file";
while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	my @p = split("\t", $line);
	$admin1lookup{ $p[0] } = $p[2];
}
close FILE;
open(FILE, "<$admin2file") or die "Can't open file $admin2file";
while (my $line = <FILE>) {
	chomp($line);
	next if $line =~ m/^\s*#/;
	my @p = split("\t", $line);
	$admin2lookup{ $p[0] } = $p[1];
}
close FILE;
#print Dumper(%admin1lookup);

# Do the cities import
open(FILE, "<$cityfile") or die "Can't open file $cityfile";

my @usstates = qw(ak al ar az ca co ct dc de fl ga hi ia id il in ks ky la ma md me mi mn mo ms mt nc nd ne nh nj nm nv ny oh ok or pa ri sc sd tn tx ut va vt wa wi wv wy usa);

my @headers = ("Geonameid", "Name", "Asciiname", "Alternatenames", "Latitude", "Longitude", 
	"Feature class", "Feature code", "Country code", "Cc2", "Admin1 code", "Admin2 code", 
	"Admin3 code", "Admin4 code", "Population", "Elevation", "Dem", "Timezone", "Modification date");
my %headers;

for(my $i=0;$i<scalar(@headers);$i++) {
	$headers[$i] =~ s/[^a-zA-Z0-9]/_/g;
	#$headers[$i] = lc($headers[$i]);
	$headers{$headers[$i]} = $i;
}

my @otherheaders = @headers;
foreach my $header ('Geonameid', 'Name', 'Asciiname', 'Alternatenames', 'Longitude', 'Latitude', 'Population') {
	@otherheaders = grep(!/^$header$/, @otherheaders);
}

#print Dumper(%headers);
#print Dumper(@otherheaders);

print "Importing cities...";
my $i = 0;
while (my $line = <FILE>) {
#$line = <FILE>;
	chomp($line);
	
	my $doc = {};
	my @p = split("\t", $line);
	
	$doc->{'_id'} = $p[ $headers{'Geonameid'} ];
	$doc->{'DisplayName'} = $p[ $headers{'Name'} ];
	$doc->{'Name'} = lc($p[ $headers{'Name'} ]);
	
	# Skip the 2 cities whose names clash with states
	if (grep(/^$doc->{'Name'}$/, @usstates)) {
		print "\nSkipping city $doc->{'Name'}\n";
		next;
	}
	
	$doc->{'Asciiname'} = lc($p[ $headers{'Asciiname'} ]);
	$doc->{'Alternatenames'} = [ split(',', $p[ $headers{'Alternatenames'} ]) ];
	$doc->{'Location'} = [ ($p[ $headers{'Longitude'} ] * 1), ($p[ $headers{'Latitude'} ] * 1) ];
	$doc->{'Population'} = int($p[ $headers{'Population'} ]);
	foreach my $header (@otherheaders) {
		$doc->{$header} = $p[ $headers{$header} ];
	}
	
	# add looked up values
	$doc->{'Country'} = $countrylookup{ $doc->{'Country_code'} }->[0];
	$doc->{'Languages'} = $countrylookup{ $doc->{'Country_code'} }->[1];
	$doc->{'Admin1'} = $admin1lookup{ "$doc->{'Country_code'}.$doc->{'Admin1_code'}" };
	$doc->{'Admin2'} = $admin2lookup{ "$doc->{'Country_code'}.$doc->{'Admin1_code'}.$doc->{'Admin2_code'}" };
	
	#print Dumper($doc);
	$db->cities->save( $doc );
	$i++;
	if ($i == 1000) {
		$i = 0;
		print ".";
		my $err = $db->last_error();
		die $err if $err && !ref($err) && !(ref($err) eq "HASH" && $err->{ok} == 1);
	}
}

close FILE;

print "\nIndexing collection...\n";
$db->cities->ensure_index( Tie::IxHash->new("Name" => 1,"Country_code" => 1,"Admin1_code" => 1) );
#$db->cities->ensure_index( Tie::IxHash->new("name" => 1,"country_code" => 1,"admin1_code" => 1, "timezone" => 1, "location" => 1) );

# make a copy of "new york city" as "new york":
my $ny = $db->cities->find_one({"Name" => "new york city"});
$ny->{_id} = "10000001";
$ny->{Name} = "new york";
$db->cities->save($ny);

print "Done.\n";
