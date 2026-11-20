export interface CountryNetworkInfo {
  iso2: string;
  name: string;
  dialCode: string;
  mcc: string;
  carriers: string[];
  senderIdPolicy: string;
  sampleLocal: string;
}

export const COUNTRY_NETWORKS: CountryNetworkInfo[] = [
  { iso2: 'US', name: 'United States', dialCode: '+1', mcc: '310', carriers: ['AT&T', 'Verizon', 'T-Mobile US'], senderIdPolicy: 'Numeric 10DLC / Toll-Free / Short Code required (no alphanumeric)', sampleLocal: '4155550101' },
  { iso2: 'CA', name: 'Canada', dialCode: '+1', mcc: '302', carriers: ['Rogers', 'Bell', 'Telus'], senderIdPolicy: 'Numeric Long Code / Short Code required', sampleLocal: '4165550101' },
  { iso2: 'GB', name: 'United Kingdom', dialCode: '+44', mcc: '234', carriers: ['EE', 'Vodafone UK', 'O2', 'Three'], senderIdPolicy: 'Alphanumeric Sender ID supported (11 chars)', sampleLocal: '07911123456' },
  { iso2: 'IN', name: 'India', dialCode: '+91', mcc: '404', carriers: ['Jio', 'Airtel', 'Vi (Vodafone Idea)', 'BSNL'], senderIdPolicy: 'DLT Entity & Template registration required for A2P', sampleLocal: '9876543210' },
  { iso2: 'PK', name: 'Pakistan', dialCode: '+92', mcc: '410', carriers: ['Jazz', 'Telenor PK', 'Zong', 'Ufone'], senderIdPolicy: 'Alphanumeric Sender ID with local operator whitelisting', sampleLocal: '03001234567' },
  { iso2: 'BD', name: 'Bangladesh', dialCode: '+880', mcc: '470', carriers: ['Grameenphone', 'Robi', 'Banglalink', 'Teletalk'], senderIdPolicy: 'BTRC masking registration or local numeric SIM', sampleLocal: '01712345678' },
  { iso2: 'LK', name: 'Sri Lanka', dialCode: '+94', mcc: '413', carriers: ['Dialog', 'Mobitel', 'Hutch', 'Airtel SL'], senderIdPolicy: 'Alphanumeric Sender ID supported with registration', sampleLocal: '0771234567' },
  { iso2: 'NP', name: 'Nepal', dialCode: '+977', mcc: '429', carriers: ['Ncell', 'Nepal Telecom'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '9841234567' },
  { iso2: 'AE', name: 'United Arab Emirates', dialCode: '+971', mcc: '424', carriers: ['Etisalat (e&)', 'du'], senderIdPolicy: 'Pre-registered Alphanumeric Sender ID required (TDRA)', sampleLocal: '0501234567' },
  { iso2: 'SA', name: 'Saudi Arabia', dialCode: '+966', mcc: '420', carriers: ['STC', 'Mobily', 'Zain KSA'], senderIdPolicy: 'CITC Sender ID registration required', sampleLocal: '0501234567' },
  { iso2: 'QA', name: 'Qatar', dialCode: '+974', mcc: '427', carriers: ['Ooredoo', 'Vodafone Qatar'], senderIdPolicy: 'Registered Alphanumeric Sender ID', sampleLocal: '33123456' },
  { iso2: 'KW', name: 'Kuwait', dialCode: '+965', mcc: '419', carriers: ['Zain', 'Ooredoo', 'stc Kuwait'], senderIdPolicy: 'Registered Alphanumeric Sender ID', sampleLocal: '50123456' },
  { iso2: 'OM', name: 'Oman', dialCode: '+968', mcc: '422', carriers: ['Omantel', 'Ooredoo Oman'], senderIdPolicy: 'Registered Alphanumeric Sender ID', sampleLocal: '92123456' },
  { iso2: 'EG', name: 'Egypt', dialCode: '+20', mcc: '602', carriers: ['Vodafone Egypt', 'Orange', 'Etisalat Misr', 'WE'], senderIdPolicy: 'NTRA Pre-registered Sender ID required', sampleLocal: '01012345678' },
  { iso2: 'NG', name: 'Nigeria', dialCode: '+234', mcc: '621', carriers: ['MTN Nigeria', 'Airtel NG', 'Glo', '9mobile'], senderIdPolicy: 'NCC Corporate Sender ID & DND bypass route', sampleLocal: '08031234567' },
  { iso2: 'KE', name: 'Kenya', dialCode: '+254', mcc: '639', carriers: ['Safaricom', 'Airtel Kenya', 'Telkom'], senderIdPolicy: 'Alphanumeric Sender ID registration required', sampleLocal: '0712345678' },
  { iso2: 'GH', name: 'Ghana', dialCode: '+233', mcc: '620', carriers: ['MTN Ghana', 'Telecel', 'AirtelTigo'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '0241234567' },
  { iso2: 'ZA', name: 'South Africa', dialCode: '+27', mcc: '655', carriers: ['Vodacom', 'MTN SA', 'Cell C', 'Telkom'], senderIdPolicy: 'Numeric Long/Short Code (Alphanumeric blocked by most MNOs)', sampleLocal: '0821234567' },
  { iso2: 'MA', name: 'Morocco', dialCode: '+212', mcc: '604', carriers: ['Maroc Telecom', 'Orange MA', 'Inwi'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '0612345678' },
  { iso2: 'ET', name: 'Ethiopia', dialCode: '+251', mcc: '636', carriers: ['Ethio Telecom', 'Safaricom Ethiopia'], senderIdPolicy: 'Pre-approved Sender ID required', sampleLocal: '0911234567' },
  { iso2: 'TZ', name: 'Tanzania', dialCode: '+255', mcc: '640', carriers: ['Vodacom TZ', 'Airtel TZ', 'Tigo'], senderIdPolicy: 'TCRA Sender ID registration required', sampleLocal: '0712345678' },
  { iso2: 'DE', name: 'Germany', dialCode: '+49', mcc: '262', carriers: ['Telekom DE', 'Vodafone DE', 'O2 Telefónica'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '015112345678' },
  { iso2: 'FR', name: 'France', dialCode: '+33', mcc: '208', carriers: ['Orange FR', 'SFR', 'Bouygues', 'Free'], senderIdPolicy: 'Alphanumeric OK (STOP required for marketing)', sampleLocal: '0612345678' },
  { iso2: 'ES', name: 'Spain', dialCode: '+34', mcc: '214', carriers: ['Movistar', 'Orange ES', 'Vodafone ES'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '612345678' },
  { iso2: 'IT', name: 'Italy', dialCode: '+39', mcc: '222', carriers: ['TIM', 'Vodafone IT', 'WindTre', 'Iliad'], senderIdPolicy: 'AGCOM Registered Alphanumeric Alias', sampleLocal: '3123456789' },
  { iso2: 'NL', name: 'Netherlands', dialCode: '+31', mcc: '204', carriers: ['KPN', 'VodafoneZiggo', 'Odido'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '0612345678' },
  { iso2: 'CH', name: 'Switzerland', dialCode: '+41', mcc: '228', carriers: ['Swisscom', 'Sunrise', 'Salt'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '0791234567' },
  { iso2: 'SE', name: 'Sweden', dialCode: '+46', mcc: '240', carriers: ['Telia', 'Tele2', 'Telenor', 'Tre'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '0701234567' },
  { iso2: 'PL', name: 'Poland', dialCode: '+48', mcc: '260', carriers: ['Orange PL', 'Play', 'Plus', 'T-Mobile PL'], senderIdPolicy: 'Alphanumeric Sender ID supported', sampleLocal: '501234567' },
  { iso2: 'TR', name: 'Turkey', dialCode: '+90', mcc: '286', carriers: ['Turkcell', 'Vodafone TR', 'Türk Telekom'], senderIdPolicy: 'BTK / IYS Pre-registered Originator required', sampleLocal: '05321234567' },
  { iso2: 'ID', name: 'Indonesia', dialCode: '+62', mcc: '510', carriers: ['Telkomsel', 'Indosat Ooredoo', 'XL Axiata', 'Smartfren'], senderIdPolicy: 'Registered Alphanumeric Masking / Local SIM', sampleLocal: '08123456789' },
  { iso2: 'PH', name: 'Philippines', dialCode: '+63', mcc: '515', carriers: ['Globe', 'Smart', 'DITO'], senderIdPolicy: 'Pre-registered Sender ID (anti-spam URL rules)', sampleLocal: '09171234567' },
  { iso2: 'MY', name: 'Malaysia', dialCode: '+60', mcc: '502', carriers: ['Maxis', 'CelcomDigi', 'U Mobile'], senderIdPolicy: 'MCMC Short Code / Registered Sender (no URLs in A2P)', sampleLocal: '0123456789' },
  { iso2: 'SG', name: 'Singapore', dialCode: '+65', mcc: '525', carriers: ['Singtel', 'StarHub', 'M1', 'Simba'], senderIdPolicy: 'IMDA SSIR Sender ID registration required', sampleLocal: '91234567' },
  { iso2: 'TH', name: 'Thailand', dialCode: '+66', mcc: '520', carriers: ['AIS', 'TrueMove H', 'dtac'], senderIdPolicy: 'Pre-registered Alphanumeric Sender ID', sampleLocal: '0812345678' },
  { iso2: 'VN', name: 'Vietnam', dialCode: '+84', mcc: '452', carriers: ['Viettel', 'Mobifone', 'Vinaphone'], senderIdPolicy: 'MIC Brandname registration required', sampleLocal: '0912345678' },
  { iso2: 'JP', name: 'Japan', dialCode: '+81', mcc: '440', carriers: ['NTT Docomo', 'au (KDDI)', 'SoftBank', 'Rakuten'], senderIdPolicy: 'Domestic Short Code / International Direct Route', sampleLocal: '09012345678' },
  { iso2: 'KR', name: 'South Korea', dialCode: '+82', mcc: '450', carriers: ['SK Telecom', 'KT', 'LG U+'], senderIdPolicy: 'KISA Pre-registered Numeric Callback Number', sampleLocal: '01012345678' },
  { iso2: 'CN', name: 'China', dialCode: '+86', mcc: '460', carriers: ['China Mobile', 'China Unicom', 'China Telecom'], senderIdPolicy: 'MIIT Signature & Template Pre-approval required', sampleLocal: '13800138000' },
  { iso2: 'AU', name: 'Australia', dialCode: '+61', mcc: '505', carriers: ['Telstra', 'Optus', 'Vodafone AU'], senderIdPolicy: 'Alphanumeric Sender ID (ACMA registry compliant)', sampleLocal: '0412345678' },
  { iso2: 'NZ', name: 'New Zealand', dialCode: '+64', mcc: '530', carriers: ['Spark', 'One NZ', '2degrees'], senderIdPolicy: 'Numeric Short Code / Long Code recommended', sampleLocal: '0211234567' },
  { iso2: 'BR', name: 'Brazil', dialCode: '+55', mcc: '724', carriers: ['Vivo', 'Claro', 'TIM Brasil'], senderIdPolicy: 'Short Code assigned by aggregator (no alphanumeric)', sampleLocal: '11991234567' },
  { iso2: 'MX', name: 'Mexico', dialCode: '+52', mcc: '334', carriers: ['Telcel', 'AT&T MX', 'Movistar MX'], senderIdPolicy: 'Short Code / Numeric Long Code (no alphanumeric)', sampleLocal: '5512345678' },
  { iso2: 'AR', name: 'Argentina', dialCode: '+54', mcc: '722', carriers: ['Claro AR', 'Personal', 'Movistar AR'], senderIdPolicy: 'Short Code / Numeric Long Code', sampleLocal: '1112345678' },
  { iso2: 'CO', name: 'Colombia', dialCode: '+57', mcc: '732', carriers: ['Claro CO', 'Movistar CO', 'Tigo'], senderIdPolicy: 'Short Code / Numeric Long Code', sampleLocal: '3001234567' },
  { iso2: 'CL', name: 'Chile', dialCode: '+56', mcc: '730', carriers: ['Entel', 'Movistar CL', 'Claro CL', 'WOM'], senderIdPolicy: 'Short Code / Numeric', sampleLocal: '912345678' },
  { iso2: 'PE', name: 'Peru', dialCode: '+51', mcc: '716', carriers: ['Movistar PE', 'Claro PE', 'Entel PE'], senderIdPolicy: 'Short Code / Numeric', sampleLocal: '987654321' },
];

// Sort longest dial code first for unambiguous prefix detection (+880 before +88/+8, +234 before +23, etc.)
const SORTED_BY_PREFIX = [...COUNTRY_NETWORKS].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

export function detectCountryFromPhone(rawPhone: string): CountryNetworkInfo | null {
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  const e164 = cleaned.startsWith('+')
    ? cleaned
    : cleaned.startsWith('00')
    ? `+${cleaned.slice(2)}`
    : `+${cleaned}`;

  for (const country of SORTED_BY_PREFIX) {
    if (e164.startsWith(country.dialCode)) {
      return country;
    }
  }

  const digits = e164.replace(/[^\d]/g, '');
  if (digits.length >= 7 && digits.length <= 15) {
    return {
      iso2: 'INTL',
      name: 'International GSM Network',
      dialCode: `+${digits.slice(0, Math.min(3, digits.length - 6))}`,
      mcc: 'ITU',
      carriers: ['Global ITU-T E.164 Carrier'],
      senderIdPolicy: 'Check destination operator sender rules',
      sampleLocal: digits,
    };
  }
  return null;
}

export function normalizeInternationalPhone(
  raw: string,
  defaultDialCode?: string
): { valid: boolean; e164: string; country?: CountryNetworkInfo; reason?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, e164: '', reason: 'Empty phone number' };
  }

  const hasPlus = trimmed.startsWith('+');
  const hasDoubleZero = trimmed.startsWith('00');
  let digits = trimmed.replace(/[^\d]/g, '');

  if (!digits) {
    return { valid: false, e164: trimmed, reason: 'No digits found in phone number' };
  }

  let e164 = '';

  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (hasDoubleZero && digits.length > 4) {
    digits = digits.slice(2);
    e164 = `+${digits}`;
  } else if (defaultDialCode && defaultDialCode.startsWith('+')) {
    const ccDigits = defaultDialCode.replace(/[^\d]/g, '');
    // Strip national trunk '0' prefix when converting local number using default country code
    let nationalDigits = digits;
    if (nationalDigits.startsWith('0') && !nationalDigits.startsWith(ccDigits)) {
      nationalDigits = nationalDigits.replace(/^0+/, '');
    }
    if (nationalDigits.startsWith(ccDigits) && nationalDigits.length >= ccDigits.length + 7) {
      e164 = `+${nationalDigits}`;
    } else {
      e164 = `+${ccDigits}${nationalDigits}`;
    }
  } else {
    // No explicit '+' and no country selected: treat 10 digits as +1 unless already carrying country digits
    if (digits.length === 10) {
      e164 = `+1${digits}`;
    } else {
      e164 = `+${digits}`;
    }
  }

  const finalDigits = e164.replace(/[^\d]/g, '');
  if (finalDigits.length < 7 || finalDigits.length > 15) {
    return {
      valid: false,
      e164: trimmed,
      reason: 'Phone number must contain 7 to 15 digits in ITU-T E.164 format (+CountryCodeNumber)',
    };
  }

  const country = detectCountryFromPhone(e164) || undefined;
  return { valid: true, e164, country };
}
