/**
 * 日期计算器模块
 * 负责排班周期的计算
 */

const DateCalculator = {
    /**
     * 根据当前日期自动计算目标排班周期
     * @returns {{year: number, month: number}} 目标年月
     */
    calculateTargetPeriod() {
        const today = new Date();
        const currentDay = today.getDate();
        let targetYear = today.getFullYear();
        let targetMonth = today.getMonth() + 1; // 当前月
        
        if (currentDay >= 1 && currentDay <= 25) {
            // 选择下月
            targetMonth += 1;
        } else {
            // 选择下下月
            targetMonth += 2;
        }
        
        // 如果月份超过12月，则年份+1，月份调整
        if (targetMonth > 12) {
            targetYear += Math.floor((targetMonth - 1) / 12);
            targetMonth = ((targetMonth - 1) % 12) + 1;
        }
        
        return { year: targetYear, month: targetMonth };
    },

    /**
     * 根据年月计算排班周期的开始和结束日期
     * @param {number} year - 年份
     * @param {number} month - 月份（1-12）
     * @returns {{startDate: Date, endDate: Date}} 开始和结束日期
     */
    calculateSchedulePeriod(year, month) {
        // 开始日期：上个月的26号（例如：选择2026.01，则开始日期是2025.12.26）
        const startDate = new Date(year, month - 2, 26);
        // 结束日期：指定年月的25号（例如：选择2026.01，则结束日期是2026.01.25）
        const endDate = new Date(year, month - 1, 25);
        
        return { startDate, endDate };
    },

    /**
     * 验证日期有效性
     * @param {Date} date - 日期对象
     * @returns {boolean} 是否有效
     */
    isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.DateCalculator = DateCalculator;
}

