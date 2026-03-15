/**
 * 全量休息配置规则模块
 *
 * 负责管理全量休息配置的所有业务规则和约束条件，包括：
 * - 约束参数配置
 * - 特殊节假日配置
 * - 年假使用策略配置
 * - 约束检查方法
 */

const FullRestConfigRules = {
    /**
     * 默认配置
     */
    defaultConfig: {
        // 大夜后最少休息天数（可配置）
        minRestAfterNightShift: 2,
        // 最长连续休假天数（可配置）
        // 注意：休假尽量保证连续2天
        maxConsecutiveRestDays: 2,
        // 休假间隔最大天数（可配置）
        maxRestInterval: 5,
        // 特殊节假日配置
        specialHolidays: {
            SPRING_FESTIVAL: { min: 6, max: 8, name: '春节' },
            NATIONAL_DAY: { min: 4, max: 7, name: '国庆' },
            NEW_YEAR: { days: 3, name: '元旦' },
            TOMB_SWEEPING: { days: 3, name: '清明' },
            DRAGON_BOAT: { days: 3, name: '端午' },
            LABOR_DAY: { days: 3, name: '五一' },
            MID_AUTUMN: { days: 3, name: '中秋' }
        }
    },

    /**
     * 当前配置
     */
    currentConfig: null,

    /**
     * 初始化配置规则
     */
    async init() {
        console.log('[FullRestConfigRules] 初始化配置规则');

        // 尝试从数据库加载配置
        if (typeof DB !== 'undefined' && DB.loadFullRestConstraints) {
            const savedConfig = await DB.loadFullRestConstraints();
            if (savedConfig) {
                this.currentConfig = this.deepMerge(this.defaultConfig, savedConfig);
                console.log('[FullRestConfigRules] 已加载保存的配置');
            } else {
                // 使用默认配置
                this.currentConfig = { ...this.defaultConfig };
                console.log('[FullRestConfigRules] 使用默认配置');
            }
        } else {
            this.currentConfig = { ...this.defaultConfig };
        }

        return this.currentConfig;
    },

    /**
     * 获取配置
     * @returns {Object} 配置对象
     */
    getConfig() {
        return this.currentConfig || this.defaultConfig;
    },

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    async updateConfig(newConfig) {
        this.currentConfig = this.deepMerge(this.defaultConfig, newConfig);

        // 保存到数据库
        if (typeof DB !== 'undefined' && DB.saveFullRestConstraints) {
            await DB.saveFullRestConstraints(this.currentConfig);
        }
    },

    /**
     * 深度合并对象
     * @param {Object} target - 目标对象
     * @param {Object} source - 源对象
     * @returns {Object} 合并后的对象
     */
    deepMerge(target, source) {
        const result = { ...target };

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    result[key] = this.deepMerge(target[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }

        return result;
    },

    /**
     * 验证配置
     * @param {Object} config - 配置对象
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    validateConfig(config) {
        const errors = [];

        // 验证大夜后休息天数
        if (config.minRestAfterNightShift < 0 || config.minRestAfterNightShift > 7) {
            errors.push('大夜后最少休息天数必须在0-7之间');
        }

        // 验证连续休假天数
        if (config.maxConsecutiveRestDays < 1 || config.maxConsecutiveRestDays > 7) {
            errors.push('最长连续休假天数必须在1-7之间');
        }

        // 验证休假间隔
        if (config.maxRestInterval < 3 || config.maxRestInterval > 10) {
            errors.push('休假间隔最大天数必须在3-10之间');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    // ==================== 约束检查方法 ====================

    /**
     * 检查大夜后休息约束
     * @param {string} dateStr - 待检查日期 (YYYY-MM-DD)
     * @param {Object} nightSchedule - 已排大夜数据 { staffId: { dateStr: true } }
     * @param {number} minRestDays - 最少休息天数
     * @returns {boolean} 是否满足约束（true=可以排班，false=必须休息）
     */
    checkRestAfterNightShift(dateStr, nightSchedule, minRestDays) {
        const targetDate = new Date(dateStr);

        // 检查每个人在这个日期之前 minRestDays 天内是否排了大夜
        for (const staffId in nightSchedule) {
            const staffNights = nightSchedule[staffId] || {};

            for (const nightDateStr in staffNights) {
                const nightDate = new Date(nightDateStr);
                const diffDays = Math.floor((targetDate - nightDate) / (1000 * 60 * 60 * 24));

                // 如果在大夜后 minRestDays 天内，不能排班（必须休息）
                if (diffDays >= 0 && diffDays < minRestDays) {
                    return false; // 违反约束
                }
            }
        }

        return true;
    },

    /**
     * 检查连续休假约束（考虑特殊节假日）
     * @param {Array<string>} assignedDates - 已分配的休假日期数组
     * @param {string} candidateDate - 候选日期 (YYYY-MM-DD)
     * @param {number} maxDays - 默认最大连续天数
     * @param {Array} dateList - 日期列表（用于检测特殊节假日范围）
     * @returns {Object} { satisfied: boolean, maxAllowed: number, reason: string }
     */
    checkConsecutiveRest(assignedDates, candidateDate, maxDays, dateList = null) {
        const candidate = new Date(candidateDate);
        let consecutiveCount = 1;

        // 收集所有连续休假的日期（包括候选日期）
        const consecutiveDates = [candidateDate];

        // 向前检查
        let checkDate = new Date(candidate);
        checkDate.setDate(checkDate.getDate() - 1);
        while (assignedDates.includes(checkDate.toISOString().split('T')[0])) {
            consecutiveDates.unshift(checkDate.toISOString().split('T')[0]);
            consecutiveCount++;
            checkDate.setDate(checkDate.getDate() - 1);
        }

        // 向后检查（假设候选日期被选中）
        checkDate = new Date(candidate);
        checkDate.setDate(checkDate.getDate() + 1);
        while (assignedDates.includes(checkDate.toISOString().split('T')[0])) {
            consecutiveDates.push(checkDate.toISOString().split('T')[0]);
            consecutiveCount++;
            checkDate.setDate(checkDate.getDate() + 1);
        }

        // 检查是否与特殊节假日重叠
        let maxAllowed = maxDays; // 默认最大天数
        let specialHolidayName = null;

        if (dateList && consecutiveDates.length > 0) {
            for (const dateStr of consecutiveDates) {
                const holiday = this.identifySpecialHoliday(dateStr);
                if (holiday) {
                    specialHolidayName = holiday.name;

                    // 根据特殊节假日类型设置最大连续天数
                    const specialHolidays = this.getConfig().specialHolidays;

                    if (holiday.name === '春节') {
                        const config = specialHolidays.SPRING_FESTIVAL;
                        maxAllowed = config.max || 8; // 春节最多8天
                    } else if (holiday.name === '国庆') {
                        const config = specialHolidays.NATIONAL_DAY;
                        maxAllowed = config.max || 7; // 国庆最多7天
                    } else if (['元旦', '清明', '五一', '端午', '中秋'].includes(holiday.name)) {
                        maxAllowed = 3; // 其他节假日3天
                    }

                    break; // 找到一个特殊节假日即可
                }
            }
        }

        // 如果连休期间没有特殊节假日，检查是否在特殊节假日附近
        if (!specialHolidayName && dateList) {
            // 检查连休期间的开始或结束日期是否靠近特殊节假日（前后1天）
            const startDate = consecutiveDates[0];
            const endDate = consecutiveDates[consecutiveDates.length - 1];

            for (const dateStr of [startDate, endDate]) {
                const date = new Date(dateStr);

                // 检查前后1天
                for (let offset = -1; offset <= 1; offset++) {
                    const checkDate = new Date(date);
                    checkDate.setDate(checkDate.getDate() + offset);
                    const checkDateStr = checkDate.toISOString().split('T')[0];

                    const holiday = this.identifySpecialHoliday(checkDateStr);
                    if (holiday) {
                        specialHolidayName = holiday.name;

                        // 根据特殊节假日类型设置最大连续天数
                        const specialHolidays = this.getConfig().specialHolidays;

                        if (holiday.name === '春节') {
                            const config = specialHolidays.SPRING_FESTIVAL;
                            maxAllowed = config.max || 8;
                        } else if (holiday.name === '国庆') {
                            const config = specialHolidays.NATIONAL_DAY;
                            maxAllowed = config.max || 7;
                        } else if (['元旦', '清明', '五一', '端午', '中秋'].includes(holiday.name)) {
                            maxAllowed = 3;
                        }

                        break;
                    }
                }

                if (specialHolidayName) break;
            }
        }

        const satisfied = consecutiveCount <= maxAllowed;

        return {
            satisfied,
            maxAllowed,
            actualDays: consecutiveCount,
            specialHoliday: specialHolidayName,
            reason: satisfied ? '' : `连续休假${consecutiveCount}天超过${specialHolidayName || '默认'}限制${maxAllowed}天`
        };
    },

    /**
     * 检查休假间隔约束
     * @param {Array<string>} assignedDates - 已分配的休假日期数组
     * @param {string} candidateDate - 候选日期 (YYYY-MM-DD)
     * @param {number} maxInterval - 最大间隔天数
     * @returns {boolean} 是否满足约束
     */
    checkRestInterval(assignedDates, candidateDate, maxInterval) {
        if (assignedDates.length === 0) return true;

        const candidate = new Date(candidateDate);
        const sortedDates = assignedDates.map(d => new Date(d)).sort((a, b) => a - b);

        // 找到候选日期应该插入的位置
        let insertIndex = 0;
        for (let i = 0; i < sortedDates.length; i++) {
            if (candidate > sortedDates[i]) insertIndex = i + 1;
            else break;
        }

        // 检查与前一个休假的间隔
        if (insertIndex > 0) {
            const prevDate = sortedDates[insertIndex - 1];
            const diffDays = Math.floor((candidate - prevDate) / (1000 * 60 * 60 * 24));
            if (diffDays > maxInterval) return false;
        }

        // 检查与后一个休假的间隔（假设候选日期被选中）
        if (insertIndex < sortedDates.length) {
            const nextDate = sortedDates[insertIndex];
            const diffDays = Math.floor((nextDate - candidate) / (1000 * 60 * 60 * 24));
            if (diffDays > maxInterval) return false;
        }

        return true;
    },

    /**
     * 检查是否与大夜冲突
     * @param {string} dateStr - 日期 (YYYY-MM-DD)
     * @param {Object} nightSchedule - 已排大夜数据 { staffId: { dateStr: true } }
     * @returns {boolean} 是否冲突（true=冲突）
     */
    checkNightShiftConflict(dateStr, nightSchedule) {
        for (const staffId in nightSchedule) {
            const staffNights = nightSchedule[staffId] || {};
            if (staffNights[dateStr]) {
                return true; // 冲突
            }
        }
        return false;
    },

    /**
     * 统计法定休天数（周末 + 法定节假日）
     * @param {Object} restDaysSnapshot - 休息日快照
     * @returns {number} 法定休天数
     */
    countLegalRestDays(restDaysSnapshot) {
        let count = 0;

        for (const dateStr in restDaysSnapshot) {
            if (restDaysSnapshot[dateStr] === true) {
                const date = new Date(dateStr);
                const dayOfWeek = date.getDay();

                // 周末
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    count++;
                } else {
                    // 法定节假日
                    const holidayName = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
                        ? HolidayManager.getHolidayName(dateStr)
                        : '';
                    if (holidayName) count++;
                }
            }
        }

        return count;
    },

    /**
     * 识别特殊假期
     * @param {string} dateStr - 日期 (YYYY-MM-DD)
     * @returns {Object|null} { name, days, type } 或 null
     */
    identifySpecialHoliday(dateStr) {
        const holidayName = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
            ? HolidayManager.getHolidayName(dateStr)
            : '';

        if (!holidayName) return null;

        const specialHolidays = this.getConfig().specialHolidays;

        if (holidayName === '春节') {
            return { name: '春节', days: specialHolidays.SPRING_FESTIVAL, type: 'MAJOR' };
        } else if (holidayName === '国庆') {
            return { name: '国庆', days: specialHolidays.NATIONAL_DAY, type: 'MAJOR' };
        } else if (['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
            return { name: holidayName, days: 3, type: 'MINOR' };
        }

        return null;
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.FullRestConfigRules = FullRestConfigRules;
}
