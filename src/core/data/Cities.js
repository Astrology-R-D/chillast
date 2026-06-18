'use strict';

/**
 * Cities — a curated, offline gazetteer used by the birth-place picker.
 *
 * Coordinates are city-centre decimal degrees (east/north positive). This keeps
 * the app fully functional without any network geocoding service; users can also
 * enter coordinates manually for places not listed here.
 *
 * Each entry: { nameZh, nameEn, country, latitude, longitude }.
 */
const CITIES = [
  // —— 中国 China ——
  { nameZh: '北京', nameEn: 'Beijing', country: 'CN', latitude: 39.9042, longitude: 116.4074 },
  { nameZh: '上海', nameEn: 'Shanghai', country: 'CN', latitude: 31.2304, longitude: 121.4737 },
  { nameZh: '广州', nameEn: 'Guangzhou', country: 'CN', latitude: 23.1291, longitude: 113.2644 },
  { nameZh: '深圳', nameEn: 'Shenzhen', country: 'CN', latitude: 22.5431, longitude: 114.0579 },
  { nameZh: '成都', nameEn: 'Chengdu', country: 'CN', latitude: 30.5728, longitude: 104.0668 },
  { nameZh: '重庆', nameEn: 'Chongqing', country: 'CN', latitude: 29.5630, longitude: 106.5516 },
  { nameZh: '杭州', nameEn: 'Hangzhou', country: 'CN', latitude: 30.2741, longitude: 120.1551 },
  { nameZh: '南京', nameEn: 'Nanjing', country: 'CN', latitude: 32.0603, longitude: 118.7969 },
  { nameZh: '武汉', nameEn: 'Wuhan', country: 'CN', latitude: 30.5928, longitude: 114.3055 },
  { nameZh: '西安', nameEn: "Xi'an", country: 'CN', latitude: 34.3416, longitude: 108.9398 },
  { nameZh: '天津', nameEn: 'Tianjin', country: 'CN', latitude: 39.3434, longitude: 117.3616 },
  { nameZh: '苏州', nameEn: 'Suzhou', country: 'CN', latitude: 31.2989, longitude: 120.5853 },
  { nameZh: '沈阳', nameEn: 'Shenyang', country: 'CN', latitude: 41.8057, longitude: 123.4315 },
  { nameZh: '哈尔滨', nameEn: 'Harbin', country: 'CN', latitude: 45.8038, longitude: 126.5350 },
  { nameZh: '长春', nameEn: 'Changchun', country: 'CN', latitude: 43.8171, longitude: 125.3235 },
  { nameZh: '大连', nameEn: 'Dalian', country: 'CN', latitude: 38.9140, longitude: 121.6147 },
  { nameZh: '青岛', nameEn: 'Qingdao', country: 'CN', latitude: 36.0671, longitude: 120.3826 },
  { nameZh: '济南', nameEn: 'Jinan', country: 'CN', latitude: 36.6512, longitude: 117.1201 },
  { nameZh: '郑州', nameEn: 'Zhengzhou', country: 'CN', latitude: 34.7466, longitude: 113.6254 },
  { nameZh: '长沙', nameEn: 'Changsha', country: 'CN', latitude: 28.2282, longitude: 112.9388 },
  { nameZh: '福州', nameEn: 'Fuzhou', country: 'CN', latitude: 26.0745, longitude: 119.2965 },
  { nameZh: '厦门', nameEn: 'Xiamen', country: 'CN', latitude: 24.4798, longitude: 118.0894 },
  { nameZh: '昆明', nameEn: 'Kunming', country: 'CN', latitude: 24.8801, longitude: 102.8329 },
  { nameZh: '南宁', nameEn: 'Nanning', country: 'CN', latitude: 22.8170, longitude: 108.3665 },
  { nameZh: '贵阳', nameEn: 'Guiyang', country: 'CN', latitude: 26.6470, longitude: 106.6302 },
  { nameZh: '兰州', nameEn: 'Lanzhou', country: 'CN', latitude: 36.0611, longitude: 103.8343 },
  { nameZh: '太原', nameEn: 'Taiyuan', country: 'CN', latitude: 37.8706, longitude: 112.5489 },
  { nameZh: '石家庄', nameEn: 'Shijiazhuang', country: 'CN', latitude: 38.0428, longitude: 114.5149 },
  { nameZh: '合肥', nameEn: 'Hefei', country: 'CN', latitude: 31.8206, longitude: 117.2290 },
  { nameZh: '南昌', nameEn: 'Nanchang', country: 'CN', latitude: 28.6820, longitude: 115.8579 },
  { nameZh: '乌鲁木齐', nameEn: 'Urumqi', country: 'CN', latitude: 43.8256, longitude: 87.6168 },
  { nameZh: '拉萨', nameEn: 'Lhasa', country: 'CN', latitude: 29.6520, longitude: 91.1721 },
  { nameZh: '呼和浩特', nameEn: 'Hohhot', country: 'CN', latitude: 40.8426, longitude: 111.7490 },
  { nameZh: '银川', nameEn: 'Yinchuan', country: 'CN', latitude: 38.4872, longitude: 106.2309 },
  { nameZh: '西宁', nameEn: 'Xining', country: 'CN', latitude: 36.6171, longitude: 101.7782 },
  { nameZh: '海口', nameEn: 'Haikou', country: 'CN', latitude: 20.0440, longitude: 110.1989 },
  { nameZh: '香港', nameEn: 'Hong Kong', country: 'CN', latitude: 22.3193, longitude: 114.1694 },
  { nameZh: '澳门', nameEn: 'Macau', country: 'CN', latitude: 22.1987, longitude: 113.5439 },
  { nameZh: '台北', nameEn: 'Taipei', country: 'CN', latitude: 25.0330, longitude: 121.5654 },

  // —— 亚洲其他 Asia ——
  { nameZh: '东京', nameEn: 'Tokyo', country: 'JP', latitude: 35.6762, longitude: 139.6503 },
  { nameZh: '大阪', nameEn: 'Osaka', country: 'JP', latitude: 34.6937, longitude: 135.5023 },
  { nameZh: '首尔', nameEn: 'Seoul', country: 'KR', latitude: 37.5665, longitude: 126.9780 },
  { nameZh: '新加坡', nameEn: 'Singapore', country: 'SG', latitude: 1.3521, longitude: 103.8198 },
  { nameZh: '吉隆坡', nameEn: 'Kuala Lumpur', country: 'MY', latitude: 3.1390, longitude: 101.6869 },
  { nameZh: '曼谷', nameEn: 'Bangkok', country: 'TH', latitude: 13.7563, longitude: 100.5018 },
  { nameZh: '雅加达', nameEn: 'Jakarta', country: 'ID', latitude: -6.2088, longitude: 106.8456 },
  { nameZh: '马尼拉', nameEn: 'Manila', country: 'PH', latitude: 14.5995, longitude: 120.9842 },
  { nameZh: '新德里', nameEn: 'New Delhi', country: 'IN', latitude: 28.6139, longitude: 77.2090 },
  { nameZh: '孟买', nameEn: 'Mumbai', country: 'IN', latitude: 19.0760, longitude: 72.8777 },
  { nameZh: '迪拜', nameEn: 'Dubai', country: 'AE', latitude: 25.2048, longitude: 55.2708 },
  { nameZh: '伊斯坦布尔', nameEn: 'Istanbul', country: 'TR', latitude: 41.0082, longitude: 28.9784 },

  // —— 欧洲 Europe ——
  { nameZh: '伦敦', nameEn: 'London', country: 'GB', latitude: 51.5074, longitude: -0.1278 },
  { nameZh: '巴黎', nameEn: 'Paris', country: 'FR', latitude: 48.8566, longitude: 2.3522 },
  { nameZh: '柏林', nameEn: 'Berlin', country: 'DE', latitude: 52.5200, longitude: 13.4050 },
  { nameZh: '罗马', nameEn: 'Rome', country: 'IT', latitude: 41.9028, longitude: 12.4964 },
  { nameZh: '马德里', nameEn: 'Madrid', country: 'ES', latitude: 40.4168, longitude: -3.7038 },
  { nameZh: '阿姆斯特丹', nameEn: 'Amsterdam', country: 'NL', latitude: 52.3676, longitude: 4.9041 },
  { nameZh: '莫斯科', nameEn: 'Moscow', country: 'RU', latitude: 55.7558, longitude: 37.6173 },
  { nameZh: '苏黎世', nameEn: 'Zurich', country: 'CH', latitude: 47.3769, longitude: 8.5417 },
  { nameZh: '维也纳', nameEn: 'Vienna', country: 'AT', latitude: 48.2082, longitude: 16.3738 },
  { nameZh: '斯德哥尔摩', nameEn: 'Stockholm', country: 'SE', latitude: 59.3293, longitude: 18.0686 },

  // —— 美洲 Americas ——
  { nameZh: '纽约', nameEn: 'New York', country: 'US', latitude: 40.7128, longitude: -74.0060 },
  { nameZh: '洛杉矶', nameEn: 'Los Angeles', country: 'US', latitude: 34.0522, longitude: -118.2437 },
  { nameZh: '芝加哥', nameEn: 'Chicago', country: 'US', latitude: 41.8781, longitude: -87.6298 },
  { nameZh: '旧金山', nameEn: 'San Francisco', country: 'US', latitude: 37.7749, longitude: -122.4194 },
  { nameZh: '西雅图', nameEn: 'Seattle', country: 'US', latitude: 47.6062, longitude: -122.3321 },
  { nameZh: '华盛顿', nameEn: 'Washington, D.C.', country: 'US', latitude: 38.9072, longitude: -77.0369 },
  { nameZh: '多伦多', nameEn: 'Toronto', country: 'CA', latitude: 43.6532, longitude: -79.3832 },
  { nameZh: '温哥华', nameEn: 'Vancouver', country: 'CA', latitude: 49.2827, longitude: -123.1207 },
  { nameZh: '墨西哥城', nameEn: 'Mexico City', country: 'MX', latitude: 19.4326, longitude: -99.1332 },
  { nameZh: '圣保罗', nameEn: 'São Paulo', country: 'BR', latitude: -23.5505, longitude: -46.6333 },
  { nameZh: '布宜诺斯艾利斯', nameEn: 'Buenos Aires', country: 'AR', latitude: -34.6037, longitude: -58.3816 },

  // —— 大洋洲与非洲 Oceania & Africa ——
  { nameZh: '悉尼', nameEn: 'Sydney', country: 'AU', latitude: -33.8688, longitude: 151.2093 },
  { nameZh: '墨尔本', nameEn: 'Melbourne', country: 'AU', latitude: -37.8136, longitude: 144.9631 },
  { nameZh: '奥克兰', nameEn: 'Auckland', country: 'NZ', latitude: -36.8485, longitude: 174.7633 },
  { nameZh: '开罗', nameEn: 'Cairo', country: 'EG', latitude: 30.0444, longitude: 31.2357 },
  { nameZh: '约翰内斯堡', nameEn: 'Johannesburg', country: 'ZA', latitude: -26.2041, longitude: 28.0473 },
  { nameZh: '内罗毕', nameEn: 'Nairobi', country: 'KE', latitude: -1.2921, longitude: 36.8219 },
];

module.exports = { CITIES };
