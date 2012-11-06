#!/usr/bin/perl

# e.g. ./import-libs.pl

use CPAN;

# this should take the default answer to all questions
$ENV{PERL_MM_USE_DEFAULT}=1;

install('Mouse');
install('MongoDB');
install('Tie::IxHash');
install('JSON');
install('Data::Dumper');
install('LWP');
install('IO::Uncompress::AnyUncompress');
install('File::Slurp');
