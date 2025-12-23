/**
 * 日期工具函数模块
 * 提供日期格式化、解析等工具函数
 */

const DateUtils = {
    /**
     * 格式化日期为 YYYY-MM-DD
     * @param {Date|string} date - 日期对象或日期字符串
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(date) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * 解析日期字符串为Date对象
     * @param {string} dateStr - 日期字符串（YYYY-MM-DD格式）
     * @returns {Date} 日期对象
     */
    parseDate(dateStr) {
        return new Date(dateStr);
    },

    /**
     * 获取两个日期之间的天数差
     * @param {string|Date} startDate - 开始日期
     * @param {string|Date} endDate - 结束日期
     * @returns {number} 天数差
     */
    getDaysDifference(startDate, endDate) {
        const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
        const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
        const diffTime = Math.abs(end - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * 判断是否为周末
     * @param {string|Date} date - 日期
     * @returns {boolean} 是否为周末
     */
    isWeekend(date) {
        const d = typeof date === 'string' ? new Date(date) : date;
        const dayOfWeek = d.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6;
    },

    /**
     * 获取星期几的中文名称
     * @param {string|Date} date - 日期
     * @returns {string} 星期几的中文名称
     */
    getWeekdayName(date) {
        const d = typeof date === 'string' ? new Date(date) : date;
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return weekdays[d.getDay()];
    }
};

// 暴露到全局作用域（向后兼容）
if (typeof window !== 'undefined') {
    window.DateUtils = DateUtils;
    // 保持原有的formatDate函数（向后兼容）
    if (typeof window.formatDate === 'undefined') {
        window.formatDate = DateUtils.formatDate.bind(DateUtils);
    }
}

