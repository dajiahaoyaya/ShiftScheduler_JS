/**
 * 休假统计辅助工具
 *
 * 负责计算和统计休假相关数据，包括：
 * - 计算个人已使用年假天数
 * - 计算个人已指定休假天数
 * - 计算需补充的休假天数
 * - 识别特殊假期
 */

function getPersonalRequests(staffId) {
    if (typeof Store !== 'undefined' && Store && typeof Store.getPersonalRequests === 'function') {
        return Store.getPersonalRequests(staffId) || {};
    }
    return {};
}

function getStaffId(staff) {
    return staff.id || staff.staffId;
}

const VacationStatsHelper = {
    /**
     * 计算个人已使用年假天数（当前月）
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @returns {number} 已使用年假天数
     */
    calculateUsedAnnualLeaveInMonth(staffId, yearMonth) {
        const personalRequests = getPersonalRequests(staffId);
        let count = 0;

        for (const dateStr in personalRequests) {
            if (dateStr.startsWith(yearMonth) && personalRequests[dateStr] === 'ANNUAL') {
                count++;
            }
        }

        return count;
    },

    /**
     * 计算个人已指定休假天数（ANNUAL + LEGAL）
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @returns {Object} { annualDays, legalDays, totalDays }
     */
    calculateSpecifiedVacationDays(staffId, yearMonth) {
        const personalRequests = getPersonalRequests(staffId);
        let annualDays = 0;
        let legalDays = 0;

        for (const dateStr in personalRequests) {
            if (dateStr.startsWith(yearMonth)) {
                const type = personalRequests[dateStr];
                if (type === 'ANNUAL') {
                    annualDays++;
                } else if (type === 'LEGAL') {
                    legalDays++;
                }
            }
        }

        return {
            annualDays,
            legalDays,
            totalDays: annualDays + legalDays
        };
    },

    /**
     * 计算需补充的休假天数
     * 公式: 需补充天数 = totalRestDays - 已指定休假天数
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @param {number} totalRestDays - 排班周期总休息日
     * @returns {number} 需补充的天数
     */
    calculateRemainingVacationDays(staffId, yearMonth, totalRestDays) {
        const { totalDays } = this.calculateSpecifiedVacationDays(staffId, yearMonth);
        return Math.max(0, totalRestDays - totalDays);
    },

    /**
     * 计算所有人需补充的休假天数统计
     * @param {Array} staffData - 人员列表
     * @param {string} yearMonth - YYYYMM格式
     * @param {number} totalRestDays - 排班周期总休息日
     * @returns {Object} { staffId: remainingDays }
     */
    calculateAllRemainingVacationDays(staffData, yearMonth, totalRestDays) {
        const result = {};

        staffData.forEach(staff => {
            const staffId = getStaffId(staff);
            const remainingDays = this.calculateRemainingVacationDays(
                staffId,
                yearMonth,
                totalRestDays
            );
            result[staffId] = remainingDays;
        });

        return result;
    },

    /**
     * 识别特殊假期
     * @param {string} dateStr - YYYY-MM-DD格式
     * @returns {Object|null} { name, days, type } 或 null
     */
    identifySpecialHoliday(dateStr) {
        const holidayName = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
            ? HolidayManager.getHolidayName(dateStr)
            : '';

        if (!holidayName) return null;

        const specialHolidays = FullRestConfigRules ? FullRestConfigRules.getConfig().specialHolidays : null;
        if (!specialHolidays) return null;

        switch (holidayName) {
            case '春节':
                return { name: '春节', days: specialHolidays.SPRING_FESTIVAL, type: 'MAJOR' };
            case '国庆':
                return { name: '国庆', days: specialHolidays.NATIONAL_DAY, type: 'MAJOR' };
            case '元旦':
            case '清明':
            case '五一':
            case '端午':
            case '中秋':
                return { name: holidayName, days: 3, type: 'MINOR' };
            default:
                return null;
        }

    },

    /**
     * 计算个人休假类型分布
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @returns {Object} { ANNUAL: number, LEGAL: number, total: number }
     */
    calculateVacationTypeDistribution(staffId, yearMonth) {
        const personalRequests = getPersonalRequests(staffId);
        const distribution = {
            ANNUAL: 0,
            LEGAL: 0,
            total: 0
        };

        for (const dateStr in personalRequests) {
            if (dateStr.startsWith(yearMonth)) {
                const type = personalRequests[dateStr];
                if (type === 'ANNUAL' || type === 'LEGAL') {
                    distribution[type]++;
                    distribution.total++;
                }
            }
        }

        return distribution;
    },

    /**
     * 计算所有人休假统计汇总
     * @param {Array} staffData - 人员列表
     * @param {string} yearMonth - YYYYMM格式
     * @returns {Object} { totalStaff, totalAnnualDays, totalLegalDays, totalVacationDays }
     */
    calculateAllVacationStats(staffData, yearMonth) {
        let totalAnnualDays = 0;
        let totalLegalDays = 0;
        let totalVacationDays = 0;

        staffData.forEach(staff => {
            const staffId = getStaffId(staff);
            const distribution = this.calculateVacationTypeDistribution(
                staffId,
                yearMonth
            );
            totalAnnualDays += distribution.ANNUAL;
            totalLegalDays += distribution.LEGAL;
            totalVacationDays += distribution.total;
        });

        return {
            totalStaff: staffData.length,
            totalAnnualDays,
            totalLegalDays,
            totalVacationDays
        };
    },

    /**
     * 检查某日期是否为特殊假期
     * @param {string} dateStr - YYYY-MM-DD格式
     * @returns {boolean} 是否为特殊假期
     */
    isSpecialHoliday(dateStr) {
        const holiday = this.identifySpecialHoliday(dateStr);
        return holiday !== null;
    },

    /**
     * 获取日期列表中的所有特殊假期
     * @param {Array} dateList - 日期列表 [{ dateStr, ... }, ...]
     * @returns {Object} { holidayName: [dateStr, ...] }
     */
    getSpecialHolidaysInDateList(dateList) {
        const result = {};

        dateList.forEach(dateInfo => {
            const holiday = this.identifySpecialHoliday(dateInfo.dateStr);
            if (holiday) {
                if (!result[holiday.name]) {
                    result[holiday.name] = [];
                }
                result[holiday.name].push(dateInfo.dateStr);
            }
        });

        return result;
    },

    /**
     * 计算某个月的工作日天数
     * @param {number} year - 年份
     * @param {number} month - 月份（1-12）
     * @returns {number} 工作日天数
     */
    calculateWorkDaysInMonth(year, month) {
        const lastDay = new Date(year, month, 0);
        let workDays = 0;

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();

            // 排除周末
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workDays++;
            }
        }

        return workDays;
    },

    /**
     * 计算某个月的周末天数
     * @param {number} year - 年份
     * @param {number} month - 月份（1-12）
     * @returns {number} 周末天数
     */
    calculateWeekendDaysInMonth(year, month) {
        const lastDay = new Date(year, month, 0);
        let weekendDays = 0;

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();

            // 统计周末
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                weekendDays++;
            }
        }

        return weekendDays;
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.VacationStatsHelper = VacationStatsHelper;
}
