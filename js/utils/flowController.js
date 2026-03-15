/**
 * 流程控制模块
 * 统一使用 AccessGuard 做页面前置与权限判定。
 */

function allowAccess() {
    return { canAccess: true, message: '' };
}

function denyAccess(message) {
    return { canAccess: false, message };
}

const FlowController = {
    checkCanAccessRequestConfig() {
        if (typeof AccessGuard !== 'undefined' && AccessGuard && typeof AccessGuard.check === 'function') {
            const result = AccessGuard.check('request', 'view');
            if (!result || result.allowed !== true) {
                return denyAccess(result && result.message ? result.message : '访问个性化休假配置失败');
            }
            return allowAccess();
        }
        return allowAccess();
    },

    checkCanAccessStaffConfig() {
        if (typeof AccessGuard !== 'undefined' && AccessGuard && typeof AccessGuard.check === 'function') {
            const result = AccessGuard.check('staff', 'view');
            if (!result || result.allowed !== true) {
                return denyAccess(result && result.message ? result.message : '访问人员管理配置失败');
            }
            return allowAccess();
        }
        return allowAccess();
    },

    checkCanAccessRuleConfig() {
        if (typeof AccessGuard !== 'undefined' && AccessGuard && typeof AccessGuard.check === 'function') {
            const result = AccessGuard.check('ruleConfig', 'view');
            if (!result || result.allowed !== true) {
                return denyAccess(result && result.message ? result.message : '访问排班规则配置失败');
            }
            return allowAccess();
        }
        return allowAccess();
    },

    showMessage(message) {
        if (typeof AccessGuard !== 'undefined' && AccessGuard && typeof AccessGuard.showMessage === 'function') {
            AccessGuard.showMessage(message);
            return;
        }
        if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
            DialogUtils.alert(message);
        } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(message);
        }

        if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
            StatusUtils.updateStatus(message, 'error');
        } else if (typeof window !== 'undefined' && typeof window.updateStatus === 'function') {
            window.updateStatus(message, 'error');
        }
    }
};

if (typeof window !== 'undefined') {
    window.FlowController = FlowController;
}
