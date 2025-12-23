/**
 * 流程控制模块
 * 负责控制页面访问的顺序和前置条件检查
 */

const FlowController = {
    /**
     * 检查是否可以访问个性化休假配置页面
     * @returns {Object} { canAccess: boolean, message: string }
     */
    checkCanAccessRequestConfig() {
        // 1. 检查排班周期配置是否激活
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (!activeSchedulePeriodConfigId) {
            return {
                canAccess: false,
                message: '请先激活一个排班周期配置'
            };
        }
        
        // 2. 检查人员管理配置是否激活
        const activeConfigId = Store.getState('activeConfigId');
        if (!activeConfigId) {
            return {
                canAccess: false,
                message: '请先激活一个人员管理配置'
            };
        }
        return { canAccess: true, message: '' };
    },
    
    /**
     * 检查是否可以访问人员管理配置页面
     * @returns {Object} { canAccess: boolean, message: string }
     */
    checkCanAccessStaffConfig() {
        // 检查排班周期配置是否激活
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (!activeSchedulePeriodConfigId) {
            return {
                canAccess: false,
                message: '请先激活一个排班周期配置'
            };
        }
        return { canAccess: true, message: '' };
    },
    
    /**
     * 检查是否可以访问排班规则配置页面
     * @returns {Object} { canAccess: boolean, message: string }
     */
    checkCanAccessRuleConfig() {
        // 1. 检查排班周期配置是否激活
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (!activeSchedulePeriodConfigId) {
            return {
                canAccess: false,
                message: '请先激活一个排班周期配置'
            };
        }
        
        // 2. 检查人员管理配置是否激活
        const activeConfigId = Store.getState('activeConfigId');
        if (!activeConfigId) {
            return {
                canAccess: false,
                message: '请先激活一个人员管理配置'
            };
        }
        
        // 3. 检查个性化休假配置是否激活
        const activeRequestConfigId = Store.getState('activeRequestConfigId');
        if (!activeRequestConfigId) {
            return {
                canAccess: false,
                message: '请先激活一个个性化休假配置'
            };
        }
        
        return { canAccess: true, message: '' };
    },
    
    /**
     * 显示提示信息
     * @param {string} message - 提示信息
     */
    showMessage(message) {
        // 显示弹窗提示
        if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
            DialogUtils.alert(message);
        } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            alert(message);
        }
        
        // 更新状态栏
        if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
            StatusUtils.updateStatus(message, 'error');
        } else if (typeof window !== 'undefined' && typeof window.updateStatus === 'function') {
            window.updateStatus(message, 'error');
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.FlowController = FlowController;
}

