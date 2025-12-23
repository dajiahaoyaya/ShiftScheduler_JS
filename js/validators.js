/**
 * 数据校验模块
 * 负责各种业务规则的校验
 */

const Validators = {
    /**
     * 校验个人休假需求（使用可配置规则）
     * 规则：
     * 1. 指定休息日不可超过配置的天数（默认3天）
     * 2. 周末指定不可超过配置的天数（默认2天）
     * 
     * @param {string} staffId - 人员ID
     * @param {Object} requests - 休假需求对象，格式：{ "YYYY-MM-DD": "REQ", ... }
     * @param {Object} scheduleConfig - 排班配置，包含 startDate 和 endDate
     * @param {Object} rules - 规则配置，包含 maxRestDays 和 maxWeekendRestDays（可选）
     * @returns {Object} 校验结果 { isValid: boolean, errors: Array<string> }
     */
    async validatePersonalRequests(staffId, requests, scheduleConfig, rules = null) {
        const errors = [];
        
        if (!requests || typeof requests !== 'object') {
            return { isValid: true, errors: [] };
        }
        
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            return { isValid: true, errors: [] };
        }
        
        // 加载规则配置（如果没有提供）
        if (!rules) {
            if (typeof DB !== 'undefined' && DB.db) {
                try {
                    rules = await DB.loadRestDayRules();
                } catch (error) {
                    console.warn('加载休息日规则失败，使用默认规则:', error);
                    rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
                }
            } else {
                rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
            }
        }
        
        const maxRestDays = rules.maxRestDays || 3;
        const maxWeekendRestDays = rules.maxWeekendRestDays || 2;
        
        const startDate = new Date(scheduleConfig.startDate);
        const endDate = new Date(scheduleConfig.endDate);
        
        // 统计总休息日数量和周末休息日数量
        let totalRestDays = 0;
        let weekendRestDays = 0;
        
        // 遍历所有请求的日期
        for (const dateStr in requests) {
            if (requests.hasOwnProperty(dateStr) && requests[dateStr] === 'REQ') {
                const requestDate = new Date(dateStr);
                
                // 检查日期是否在排班周期内
                if (requestDate >= startDate && requestDate <= endDate) {
                    totalRestDays++;
                    
                    // 检查是否为周末（周六或周日）
                    const dayOfWeek = requestDate.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        weekendRestDays++;
                    }
                }
            }
        }
        
        // 规则1：指定休息日不可超过配置的天数
        if (totalRestDays > maxRestDays) {
            errors.push(`指定休息日超过${maxRestDays}天（当前：${totalRestDays}天）`);
        }
        
        // 规则2：周末指定不可超过配置的天数
        if (weekendRestDays > maxWeekendRestDays) {
            errors.push(`周末指定休息日超过${maxWeekendRestDays}天（当前：${weekendRestDays}天）`);
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },
    
    /**
     * 校验所有人员的休假需求
     * @param {Object} allRequests - 所有人员的休假需求，格式：{ "staffId": { "YYYY-MM-DD": "REQ", ... }, ... }
     * @param {Object} scheduleConfig - 排班配置
     * @param {Object} rules - 规则配置（可选）
     * @returns {Promise<Object>} 校验结果 { "staffId": { isValid: boolean, errors: Array<string> }, ... }
     */
    async validateAllPersonalRequests(allRequests, scheduleConfig, rules = null) {
        const results = {};
        
        if (!allRequests || typeof allRequests !== 'object') {
            return results;
        }
        
        // 加载规则配置（如果没有提供）
        if (!rules) {
            if (typeof DB !== 'undefined' && DB.db) {
                try {
                    rules = await DB.loadRestDayRules();
                } catch (error) {
                    console.warn('加载休息日规则失败，使用默认规则:', error);
                    rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
                }
            } else {
                rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
            }
        }
        
        for (const staffId in allRequests) {
            if (allRequests.hasOwnProperty(staffId)) {
                results[staffId] = await this.validatePersonalRequests(
                    staffId,
                    allRequests[staffId],
                    scheduleConfig,
                    rules
                );
            }
        }
        
        return results;
    }
};

