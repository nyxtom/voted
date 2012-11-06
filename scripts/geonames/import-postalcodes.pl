#!/usr/bin/perl

# e.g. ./import-postalcodes.pl -h localhost -u nuvicorp -p XXX

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

my $postfile = 'allCountries.txt';
my $countryfile = 'countryInfo.txt';
my $admin1file = 'admin1CodesASCII.txt';
my $admin2file = 'admin2Codes.txt';

my %filelocations = ( 
		'allCountries.txt' => 'http://download.geonames.org/export/zip/allCountries.zip',
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

print "Connecting to Mongo...\n";
my $conn = MongoDB::Connection->new(%conndetails);
my $db = $conn->geonames;

# Drop the old postalcodes collection in mongo
print "Dropping old postalcodes collection...\n";
$db->postalcodes->drop();
my $err = $db->last_error();
die $err if $err && !ref($err) && !(ref($err) eq "HASH" && $err->{ok} == 1);

# Do the postalcodes import
open(FILE, "<$postfile") or die "Can't open file $postfile";

my @headers = qw/Country_Code Postal_Code Place_Name Admin_Name1 Admin_Code1 Admin_Name2 Admin_Code2 Admin_Name3 Admin_Code3 Latitude Longitude Accuracy/;
my %headers;

for(my $i=0;$i<scalar(@headers);$i++) {
	$headers{$headers[$i]} = $i;
}

my @otherheaders = @headers;
foreach my $header ('Longitude', 'Latitude') {
	@otherheaders = grep(!/^$header$/, @otherheaders);
}

print "Importing postalcodes...";
my $i = 0;
my $skipped = 0;
while (my $line = <FILE>) {
#$line = <FILE>;
	chomp($line);
	
	my $doc = {};
	my @p = split("\t", $line);
	
	if (!$p[ $headers{'Longitude'} ] || !$p[ $headers{'Latitude'} ] || $p[ $headers{'Longitude'} ] =~ m/^\s*$/ || $p[ $headers{'Latitude'} ] =~ m/^\s*$/) {
		$skipped++;
		next;
	}
	
	$doc->{'_id'} = $p[ $headers{'Country_Code'} ] . '-' . $p[ $headers{'Postal_Code'} ];
	$doc->{'Location'} = [ ($p[ $headers{'Longitude'} ] * 1), ($p[ $headers{'Latitude'} ] * 1) ];

	foreach my $header (@otherheaders) {
		$doc->{$header} = $p[ $headers{$header} ];
	}
	
	# override admin_code2 for UK
	$doc->{'Country'} = $countrylookup{ $doc->{'Country_Code'} }->[0];

	my $county = $p[ $headers{Admin_Name2} ];
	if ( $doc->{'Country_Code'} eq 'GB' && $county && 
		$county !~ m/Channel Islands/ &&
		$county ne 'Isle of Man'
		) {
	
		$county = "City of Kingston upon Hull" if $county eq "Hull";
		$county = "City and Borough of Manchester" if $county eq "Greater Manchester";
		$county = "City and Borough of Liverpool" if $county eq "Merseyside";
		$county = "Borough of Brighton and Hove" if $county eq "Brighton & Hove";
		$county = "Royal Borough of Windsor and Maidenhead" if $county eq "Windsor and Maidenhead";
		$county = "City and Borough of Newcastle upon Tyne" if $county eq "Tyne and Wear";
		$county = "City and Borough of Sheffield" if $county eq "South Yorkshire";
		$county = "City and Borough of Birmingham" if $county eq "West Midlands";
		$county = "City and Borough of Leeds" if $county eq "West Yorkshire";	
		
		$county = "Herefordshire" if $county eq "Hereford and Worcester";
		$county = "Cheshire West and Chester" if $county eq "Cheshire";

		$county = "West Berkshire" if $county eq "Berkshire";
		$county = "Bedford" if $county eq "Bedfordshire";
		$county = "Bridgend county borough" if $county eq "Bridgend";
		$county = "Bath and North East Somerset" if $county eq "Bath Avon";
		$county = "City of Bristol" if $county eq "Bristol Avon";
		$county = "City and Borough of Sheffield" if $county eq "Yorkshire, South";
		$county = "City and Borough of Leeds" if $county eq "Yorkshire, West";
		$county = "West Sussex" if $county eq "Sussex";
		$county = "East Riding of Yorkshire" if $county eq "E Riding of Yorkshire";
		$county = "North East Lincolnshire" if $county eq "North Eart Lincolnshire";
		
		$county = "North Yorkshire" if $county eq "Yorkshire, North";
		$county = "East Riding of Yorkshire" if $county eq "Yorkshire, East (North Humberside)";
		$county = "City and Borough of Newcastle upon Tyne" if $county eq "Tyne & Wear";
		$county = "North Yorkshire" if $county eq "Cleveland";
		$county = "Greater London" if $county eq "Middlesex";
		$county = "Down District" if $county eq "County Down";
		$county = "City of Derry" if $county eq "County Londonderry";
		$county = "Armagh District" if $county eq "County Armagh";
		$county = "Omagh District" if $county eq "County Tyrone";
		$county = "Fermanagh District" if $county eq "County Fermanagh";
		$county = "Eilean Siar" if $county eq "Western Isles";
		$county = "The Scottish Borders" if $county eq "Scottish Borders";
		$county = "Anglesey" if $county eq "Isle of Anglesey";
		$county = "Sir Powys" if $county eq "Powys";
		$county = "Vale of Glamorgan" if $county eq "Glamorgan";
		$county = "East Dunbartonshire" if $county eq "Dunbartonshire";
		$county = "West Dunbartonshire" if $county eq "West Dunbart";
		$county = "Aberdeenshire" if $county eq "Banffshire";		
		$county = "North Lincolnshire" if $county eq "Lincolnshire (South Humberside)";
		$county = "Eilean Siar" if $county eq "Isle of Barra";
		$county = "Orkney Islands" if $county eq "Orkney";
		$county = "Eilean Siar" if $county eq "Isle of South Uist";
		$county = "Eilean Siar" if $county eq "Isle of North Uist";
		$county = "Moray" if $county eq "Morayshire";


		my $countycode = "";
		foreach my $prefix ("", "Borough of ", "City and Borough of ", "City of ", "District of ", 
			"County of ", "County Borough of ", "City and County of ") {
			$countycode = $ukCountyCodeLookup{ $prefix.$county };
			last if $countycode;
		}
		if (!$countycode) {
			print "Couldn't find county $county in county code lookup table.\n";
		}
		else {
			$doc->{'Admin_Code2'} = $countycode;
		}
	}
	
	#print Dumper($doc);
	$db->postalcodes->save( $doc );
	$i++;
	if ($i == 1000) {
		$i = 0;
		print ".";
		my $err = $db->last_error();
		die $err if $err && !ref($err) && !(ref($err) eq "HASH" && $err->{ok} == 1);
	}
}

close FILE;

print "\nSkipped $skipped because there was no lat/lon.\n\nDone.\n";
