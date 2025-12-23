/**
 * 节假日管理器模块
 * 负责法定节假日的管理和查询
 */

const HolidayManager = {
    /**
     * 获取指定年份的法定节假日
     * @param {number} year - 年份
     * @returns {Object} 节假日对象 { "YYYY-MM-DD": "节假日名称", ... }
     */
    getHolidays(year) {
        const holidays = {};

        // 固定公历节假日
        holidays[`${year}-01-01`] = '元旦';
        holidays[`${year}-05-01`] = '五一';
        holidays[`${year}-05-02`] = '五一';
        holidays[`${year}-05-03`] = '五一';
        for (let day = 1; day <= 7; day++) {
            holidays[`${year}-10-${String(day).padStart(2, '0')}`] = '国庆';
        }

        // 农历节日（来自 LunarHolidays，至2050）
        if (typeof LunarHolidays !== 'undefined' && LunarHolidays.map) {
            Object.entries(LunarHolidays.map).forEach(([dateStr, name]) => {
                if (dateStr.startsWith(String(year))) {
                    holidays[dateStr] = name;
                    // 春节：当天及后两天
                    if (name === '春节') {
                        const base = new Date(dateStr);
                        for (let i = 1; i <= 2; i++) {
                            const ext = new Date(base);
                            ext.setDate(ext.getDate() + i);
                            const extStr = ext.toISOString().split('T')[0];
                            if (extStr.startsWith(String(year))) {
                                holidays[extStr] = '春节';
                            }
                        }
                    }
                }
            });
        }

        return holidays;
    },

    /**
     * 判断某个日期是否是固定假期（不可更改的）
     * @param {string} dateStr - 日期字符串（YYYY-MM-DD格式）
     * @returns {boolean} 是否是固定假期
     */
    isFixedHoliday(dateStr) {
        const date = new Date(dateStr);
        const month = date.getMonth() + 1; // 0-11 -> 1-12
        const day = date.getDate();
        const year = date.getFullYear();
        
        // 0101（元旦）
        if (month === 1 && day === 1) {
            return true;
        }
        
        // 0501-0503（劳动节）
        if (month === 5 && day >= 1 && day <= 3) {
            return true;
        }
        
        // 1001-1003（国庆节）
        if (month === 10 && day >= 1 && day <= 3) {
            return true;
        }
        
        // 获取节假日信息
        const holidays = this.getHolidays(year);
        const holidayName = holidays[dateStr];
        
        // 清明、端午、中秋当天
        if (holidayName === '清明' || holidayName === '端午' || holidayName === '中秋') {
            return true;
        }
        
        // 春节第一天及其后2天（共3天）
        // 需要找到春节的第一天
        const springFestivalDates = Object.keys(holidays).filter(d => holidays[d] === '春节').sort();
        if (springFestivalDates.length > 0) {
            const firstDay = springFestivalDates[0];
            const firstDate = new Date(firstDay);
            const currentDate = new Date(dateStr);
            const diffDays = Math.floor((currentDate - firstDate) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 2) {
                return true;
            }
        }
        
        return false;
    },

    /**
     * 判断某个日期是否是节假日
     * @param {string} dateStr - 日期字符串（YYYY-MM-DD格式）
     * @param {number} year - 年份（可选，如果不提供则从dateStr解析）
     * @returns {boolean} 是否是节假日
     */
    isHoliday(dateStr, year = null) {
        if (!year) {
            year = new Date(dateStr).getFullYear();
        }
        const holidays = this.getHolidays(year);
        return !!holidays[dateStr];
    },

    /**
     * 获取某个日期的节假日名称
     * @param {string} dateStr - 日期字符串（YYYY-MM-DD格式）
     * @param {number} year - 年份（可选，如果不提供则从dateStr解析）
     * @returns {string} 节假日名称，如果不是节假日则返回空字符串
     */
    getHolidayName(dateStr, year = null) {
        if (!year) {
            year = new Date(dateStr).getFullYear();
        }
        const holidays = this.getHolidays(year);
        return holidays[dateStr] || '';
    }
};

// 暴露到全局作用域（向后兼容）
if (typeof window !== 'undefined') {
    window.HolidayManager = HolidayManager;
    // 保持原有的getHolidays和isFixedHoliday函数（向后兼容）
    if (typeof window.getHolidays === 'undefined') {
        window.getHolidays = HolidayManager.getHolidays.bind(HolidayManager);
    }
    if (typeof window.isFixedHoliday === 'undefined') {
        window.isFixedHoliday = HolidayManager.isFixedHoliday.bind(HolidayManager);
    }
}

