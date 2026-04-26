const INSTRUMENTS = [
  { sym: 'NIFTY50', name: 'NIFTY 50', type: 'index', exchange: 'NSE', sector: 'Broad Market', currentPrice: 24530.90, changePct: 1.12, high52: 24853.15, low52: 19281.75, inav: 24526.74 },
  { sym: 'SENSEX', name: 'BSE SENSEX', type: 'index', exchange: 'BSE', sector: 'Broad Market', currentPrice: 80716.55, changePct: 0.87, high52: 85978.25, low52: 64487.30, inav: 80702.14 },
  { sym: 'BANKNIFTY', name: 'Bank Nifty', type: 'index', exchange: 'NSE', sector: 'Financials', currentPrice: 52148.30, changePct: -0.34, high52: 54467.35, low52: 43472.05, inav: 52144.02 },
  { sym: 'MIDCAP', name: 'NIFTY Midcap 150', type: 'index', exchange: 'NSE', sector: 'Broad Market', currentPrice: 17842.10, changePct: 1.56, high52: 18324.00, low52: 12874.50, inav: 17840.90 },
  { sym: 'GOLDBEES', name: 'Nippon India Gold ETF', type: 'etf', exchange: 'NSE', sector: 'Commodity', currentPrice: 124.24, changePct: 0.52, high52: 148.14, low52: 108.09, inav: 124.02 },
  { sym: 'HDFCGOLD', name: 'HDFC Gold ETF', type: 'etf', exchange: 'NSE', sector: 'Commodity', currentPrice: 59.14, changePct: 0.48, high52: 70.22, low52: 49.80, inav: 59.09 },
  { sym: 'SILVERBEES', name: 'Nippon Silver ETF', type: 'etf', exchange: 'NSE', sector: 'Commodity', currentPrice: 112.30, changePct: 1.23, high52: 145.00, low52: 72.40, inav: 112.15 },
  { sym: 'NIFTYBEES', name: 'Nippon Nifty BeES', type: 'etf', exchange: 'NSE', sector: 'Broad Market', currentPrice: 246.50, changePct: 1.10, high52: 257.80, low52: 192.60, inav: 246.38 },
  { sym: 'LIQUIDBEES', name: 'Nippon Liquid BeES', type: 'etf', exchange: 'NSE', sector: 'Debt', currentPrice: 1000.25, changePct: 0.01, high52: 1001.00, low52: 999.80, inav: 1000.21 },
  { sym: 'RELIANCE', name: 'Reliance Industries', type: 'stock', exchange: 'NSE', sector: 'Energy', currentPrice: 2912.45, changePct: 1.34, high52: 3217.90, low52: 2220.30, inav: null },
  { sym: 'TCS', name: 'Tata Consultancy Services', type: 'stock', exchange: 'NSE', sector: 'Information Technology', currentPrice: 3485.60, changePct: -0.78, high52: 4592.25, low52: 3311.00, inav: null },
  { sym: 'INFY', name: 'Infosys Ltd', type: 'stock', exchange: 'NSE', sector: 'Information Technology', currentPrice: 1548.90, changePct: -0.22, high52: 2006.45, low52: 1358.35, inav: null },
  { sym: 'HDFCBANK', name: 'HDFC Bank', type: 'stock', exchange: 'NSE', sector: 'Financials', currentPrice: 1721.30, changePct: 0.91, high52: 1880.00, low52: 1363.55, inav: null },
  { sym: 'BHARTIARTL', name: 'Bharti Airtel', type: 'stock', exchange: 'NSE', sector: 'Telecom', currentPrice: 1689.75, changePct: 2.14, high52: 1779.90, low52: 1009.05, inav: null },
  { sym: 'ICICIBANK', name: 'ICICI Bank', type: 'stock', exchange: 'NSE', sector: 'Financials', currentPrice: 1312.80, changePct: 0.64, high52: 1429.95, low52: 993.85, inav: null },
  { sym: 'WIPRO', name: 'Wipro Ltd', type: 'stock', exchange: 'NSE', sector: 'Information Technology', currentPrice: 258.40, changePct: -1.12, high52: 324.00, low52: 208.45, inav: null },
  { sym: 'KOTAKBANK', name: 'Kotak Mahindra Bank', type: 'stock', exchange: 'NSE', sector: 'Financials', currentPrice: 2025.60, changePct: 0.38, high52: 2235.20, low52: 1543.85, inav: null },
  { sym: 'SBIN', name: 'State Bank of India', type: 'stock', exchange: 'NSE', sector: 'Financials', currentPrice: 778.25, changePct: 1.87, high52: 912.00, low52: 600.65, inav: null },
  { sym: 'LT', name: 'Larsen & Toubro', type: 'stock', exchange: 'NSE', sector: 'Industrials', currentPrice: 3512.90, changePct: 1.05, high52: 3963.00, low52: 2871.25, inav: null },
  { sym: 'HCLTECH', name: 'HCL Technologies', type: 'stock', exchange: 'NSE', sector: 'Information Technology', currentPrice: 1589.30, changePct: -0.45, high52: 1976.80, low52: 1235.00, inav: null },
  { sym: 'MIRAE_ELSS', name: 'Mirae Asset Tax Saver Fund', type: 'mf', exchange: 'NSE', sector: 'Mutual Fund', currentPrice: 38.92, changePct: 1.02, high52: 41.20, low52: 30.14, inav: null },
  { sym: 'PARAG_FLEXI', name: 'Parag Parikh Flexi Cap', type: 'mf', exchange: 'NSE', sector: 'Mutual Fund', currentPrice: 83.45, changePct: 0.73, high52: 87.30, low52: 61.20, inav: null },
  { sym: 'MOTILAL_LARGE', name: 'Motilal Oswal Large Cap Fund', type: 'mf', exchange: 'NSE', sector: 'Mutual Fund', currentPrice: 54.88, changePct: 0.62, high52: 58.10, low52: 44.20, inav: null },
  { sym: 'HDFC_MID', name: 'HDFC Midcap Opportunities', type: 'mf', exchange: 'NSE', sector: 'Mutual Fund', currentPrice: 148.72, changePct: 1.45, high52: 157.80, low52: 108.60, inav: null },
  { sym: 'QUANT_SMALL', name: 'Quant Small Cap Fund', type: 'mf', exchange: 'NSE', sector: 'Mutual Fund', currentPrice: 312.50, changePct: 2.10, high52: 347.90, low52: 210.80, inav: null },
  { sym: 'NIPPON_SMALL', name: 'Nippon India Small Cap Fund', type: 'mf', exchange: 'NSE', sector: 'Mutual Fund', currentPrice: 72.90, changePct: 1.84, high52: 81.44, low52: 52.28, inav: null }
];

const SECTORS = [
  { name: 'Information Technology', changePct: 1.24, marketCap: '₹18.4L Cr' },
  { name: 'Banking & Finance', changePct: -0.34, marketCap: '₹32.1L Cr' },
  { name: 'Energy & Oil', changePct: 1.87, marketCap: '₹14.2L Cr' },
  { name: 'Healthcare', changePct: 0.92, marketCap: '₹8.7L Cr' },
  { name: 'FMCG', changePct: 0.41, marketCap: '₹12.3L Cr' },
  { name: 'Metals', changePct: 2.34, marketCap: '₹6.8L Cr' },
  { name: 'Auto', changePct: -1.12, marketCap: '₹9.4L Cr' },
  { name: 'Telecom', changePct: 2.87, marketCap: '₹7.1L Cr' },
  { name: 'Pharma', changePct: 0.67, marketCap: '₹5.9L Cr' },
  { name: 'Realty', changePct: -0.89, marketCap: '₹3.2L Cr' },
  { name: 'Media', changePct: -0.54, marketCap: '₹1.1L Cr' },
  { name: 'Chemicals', changePct: 1.43, marketCap: '₹4.5L Cr' }
];

const DEFAULT_ALERTS = [
  { symbol: 'GOLDBEES', condition: 'below', target: 120, note: 'Monthly low watch', enabled: true },
  { symbol: 'RELIANCE', condition: 'above', target: 3000, note: 'Target price reached', enabled: true },
  { symbol: 'TCS', condition: 'below', target: 3400, note: 'Buy zone', enabled: false }
];

const DEFAULT_WATCHLIST = ['GOLDBEES', 'RELIANCE', 'TCS', 'NIFTY50', 'HDFCBANK', 'SILVERBEES'];

const PORTFOLIO_TEMPLATES = {
  'demo@marketpulse.local': [
    { symbol: 'PARAG_FLEXI', units: 12.2, avgCost: 76.8, source: 'demo_fetch' },
    { symbol: 'HDFC_MID', units: 8.6, avgCost: 140.4, source: 'demo_fetch' },
    { symbol: 'NIFTYBEES', units: 10.0, avgCost: 232.0, source: 'demo_fetch' }
  ],
  'admin@marketpulse.local': [
    { symbol: 'GOLDBEES', units: 16.0, avgCost: 118.4, source: 'demo_fetch' },
    { symbol: 'RELIANCE', units: 2.0, avgCost: 2844.0, source: 'demo_fetch' },
    { symbol: 'LIQUIDBEES', units: 6.0, avgCost: 999.9, source: 'demo_fetch' }
  ],
  'anasquazi1@gmail.com': [
    { symbol: 'PARAG_FLEXI', units: 18.44, avgCost: 79.12, source: 'email_fetch' },
    { symbol: 'MOTILAL_LARGE', units: 22.15, avgCost: 51.38, source: 'email_fetch' },
    { symbol: 'NIPPON_SMALL', units: 31.72, avgCost: 68.04, source: 'email_fetch' }
  ]
};

module.exports = {
  INSTRUMENTS,
  SECTORS,
  DEFAULT_ALERTS,
  DEFAULT_WATCHLIST,
  PORTFOLIO_TEMPLATES
};
