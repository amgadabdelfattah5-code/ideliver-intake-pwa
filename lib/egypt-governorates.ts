export const egyptGovernorates = [
  'القاهرة',
  'الجيزة',
  'القليوبية',
  'الإسكندرية',
  'البحيرة',
  'مطروح',
  'الدقهلية',
  'دمياط',
  'كفر الشيخ',
  'الغربية',
  'المنوفية',
  'الشرقية',
  'الإسماعيلية',
  'بورسعيد',
  'السويس',
  'شمال سيناء',
  'جنوب سيناء',
  'بني سويف',
  'الفيوم',
  'المنيا',
  'أسيوط',
  'سوهاج',
  'قنا',
  'الأقصر',
  'أسوان',
  'البحر الأحمر',
  'الوادي الجديد',
] as const;

const governorateAliases: Record<string, string[]> = {
  القاهرة: ['القاهره', 'cairo'],
  الجيزة: ['الجيزه', 'giza'],
  القليوبية: ['القليوبيه', 'qalyubia', 'qalubia', 'kalyoubia'],
  الإسكندرية: ['الاسكندرية', 'الاسكندريه', 'alexandria'],
  البحيرة: ['البحيره', 'beheira', 'behera'],
  مطروح: ['matrouh', 'matruh'],
  الدقهلية: ['الدقهليه', 'dakahlia'],
  دمياط: ['damietta', 'domyat'],
  'كفر الشيخ': ['kafr el sheikh', 'kafr elsheikh', 'kafr al sheikh'],
  الغربية: ['الغربيه', 'gharbia', 'gharbeya'],
  المنوفية: ['المنوفيه', 'monufia', 'menofia', 'monofia'],
  الشرقية: ['الشرقيه', 'sharqia', 'sharkia'],
  الإسماعيلية: ['الاسماعيلية', 'الاسماعيليه', 'ismailia', 'ismailiya'],
  بورسعيد: ['بور سعيد', 'port said', 'portsaid'],
  السويس: ['suez'],
  'شمال سيناء': ['north sinai'],
  'جنوب سيناء': ['south sinai'],
  'بني سويف': ['بنى سويف', 'beni suef', 'bani suef'],
  الفيوم: ['faiyum', 'fayoum'],
  المنيا: ['minya', 'menia'],
  أسيوط: ['اسيوط', 'asyut', 'assiut'],
  سوهاج: ['sohag'],
  قنا: ['qena'],
  الأقصر: ['الاقصر', 'luxor'],
  أسوان: ['اسوان', 'aswan'],
  'البحر الأحمر': ['البحر الاحمر', 'red sea'],
  'الوادي الجديد': ['الوادى الجديد', 'new valley'],
};

function normalizeGovernorateKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const governorateLookup = new Map<string, string>();

for (const governorate of egyptGovernorates) {
  governorateLookup.set(normalizeGovernorateKey(governorate), governorate);

  for (const alias of governorateAliases[governorate] || []) {
    governorateLookup.set(normalizeGovernorateKey(alias), governorate);
  }
}

export function normalizeEgyptGovernorate(value: string | null | undefined): string {
  if (!value) return '';
  return governorateLookup.get(normalizeGovernorateKey(value)) || value.trim();
}

export function isKnownEgyptGovernorate(value: string | null | undefined): boolean {
  if (!value) return false;
  return governorateLookup.has(normalizeGovernorateKey(value));
}
