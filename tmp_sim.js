const XML_PATH = '\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork';
const DATE = '21-05-2026';
const TIME = '122509';
const PRINTER = 'YOKO';
// Najdluzszy realny filename z Neraki
const FILENAME = 'ON313127_hannah_livesey_2of2_Neraki Waterproof Canvas FR (Water Repellant)_2x_Linear Meter - 1m increments_XWD325858f99f0f4aa3af803129c184abb3_FF.pdf';
const GROUP = 'Neraki Waterproof Canvas FR (Water Repellant)';

// Fixed overhead = xmlPath + \PRINTED\ + date + \PRINTED_HHMMSS- + -PRINTER\
// Oblicz ile zostaje na group + filename
const fixedOverhead = `${XML_PATH}\\PRINTED\\${DATE}\\PRINTED_${TIME}--${PRINTER}\\`.length;
console.log('Fixed overhead (bez nazwy grupy):', fixedOverhead, 'chars');
console.log('Filename length:', FILENAME.length, 'chars');
console.log('Max group length dla path <= 260:', 260 - fixedOverhead - FILENAME.length, 'chars');
console.log('');

// Symulacja roznych limitow
const ALL_MATERIALS = [
  'Cotton Slub','Stretch Lycra French Terry','Poppy Lycra Jersey','Organic Jersey Interlock',
  'Organic Iris Jersey','Single Cotton Elastane Jersey','DSTK - Stretch Lycra French Terry',
  'Organic Drill Natural','Panama','Organic Leve Panama Natural','Hector Linen','Poplin',
  'Light Twill','Organic Drill Optic','Organic Optic Calico','Satin','Top Sateen',
  'Organic Blossom Muslin Gauze','Organic Panama Natural','Organic Leve Cotton Panama Natural',
  'Organic Jasmine Lycra Jersey','Cotton Denim','Organic Poplin','Organic Satin',
  'Optic White Organic Panama','Melino Linen','Limani Linen','DSTK - Organic Jersey Interlock',
  'Organic Stratos Linen','Organic Nimbus Linen','Organic Calico Natural','Calico Plain Cotton','Drill',
  'Eco Pique','Micro Linen','Slub Chiffon','Chiffon','DSTK - Recycled Ripstop','Gloss Satin',
  'Tentex (Water Repellant)','Eco Jersey','Eco Display FR','Easy Care Twill','DSTK - Shimmer Velvet',
  'Eco Telis Velvet - Domestic FR','Eco Basketweave','DSTK - Velvet Satin','DSTK - Heavy Bandage Crepe',
  'DSTK - Shark Satin','DSTK - Eco Pique','Eco rPet Canvas','Eco Micro Jersey',
  'Eco Telis Velvet - Non FR','Crepe de Chine','Panama FR','Heavy Lycra 210','Massey Crepe',
  'Eco Jogger Fleece Back','Plainweave FR','Palatine Velvet FR','Lining','Eco Surf Pro',
  'Ligos Velvet','DSTK - Eco Jersey','Fine Stripe Chiffon','Eco Recycled Ripstop','Voile FR',
  'Waterproof Suede FR','DSTK - Fluid Twill','DSTK - SoftShell Ultra','Summer Voile','Dupioni FR',
  'Crinkle Gauze','Eco Fleece','Eco Soft Tulle','DSTK - Eco Bridal Twill','Metallic Silver Satin Twill',
  'DSTK - Poly Tulle','DSTK - Paros Stretch Twill','Eco Upholstery FR','Eco Gloss Satin',
  'Avio Cotton Mix','Neraki Waterproof Canvas FR (Water Repellant)','Cora Canvas','Eco Sprint Knit',
  'DSTK - Micro Linen','Recycled Eco Lycra','DSTK - Flat Velvet','Eco Power Net','Heavy Satin FR',
  'Scuba Bodyfit','Oslo FR','Aqua Plain Tex - PUL (Water Repellant)','Diago Stretch','Velvet',
  'Duchess Satin','Luxe Velvet','3-Pass Blackout FR','Bayeux Upholstery','Leos Cotton Mix',
  'Eco Velvet','DSTK - Heavy Chenille','Eco Dynamica Lycra','Eco Mali Crepe','Organza',
  'Plutus Velvet FR','Active Eco Lycra','DSTK - Slub Chiffon','Easy Care Panama',
  'Eco Glitter Dot Lycra','Eco Linen Look','Eco Lotus Twill (Water Repellant)','Eco Satin Flow',
  'Eco Silk Twill','Eco Super Fine Chiffon','Georgette','Faux Silky Satin','Eco Taffeta',
  'Eco Chiffon','Stretch Jersey'
];

const MAX_LEN = 20;
console.log(`=== Limit: ${MAX_LEN} znakow dla nazwy materialu ===`);
console.log('');
const affected = ALL_MATERIALS.filter(m => m.length > MAX_LEN);
if (affected.length === 0) {
  console.log('Zadne materialy nie sa dotknite!');
} else {
  affected.forEach(m => {
    const g = m.slice(0, MAX_LEN).trimEnd();
    console.log(`  "${m}"`);
    console.log(`  -> "${g}"`);
    console.log('');
  });
}
console.log(`Dotkniete: ${affected.length} z ${ALL_MATERIALS.length} materialow`);
