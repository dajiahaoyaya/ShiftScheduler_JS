/**
 * 状态提示工具模块
 * 提供状态更新、提示等功能
 */

const StatusUtils = {
    /**
     * 更新状态提示
     * @param {string} message - 提示信息
     * @param {string} type - 类型：'info' | 'success' | 'error'
     */
    updateStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
            statusText.className = `text-sm font-medium ${
                type === 'success' ? 'text-green-600' : 
                type === 'error' ? 'text-red-600' : 
                'text-gray-800'
            }`;
        }
    },

    /**
     * 显示成功提示
     * @param {string} message - 提示信息
     */
    showSuccess(message) {
        this.updateStatus(message, 'success');
    },

    /**
     * 显示错误提示
     * @param {string} message - 提示信息
     */
    showError(message) {
        this.updateStatus(message, 'error');
    },

    /**
     * 显示信息提示
     * @param {string} message - 提示信息
     */
    showInfo(message) {
        this.updateStatus(message, 'info');
    }
};

// 暴露到全局作用域（向后兼容）
if (typeof window !== 'undefined') {
    window.StatusUtils = StatusUtils;
    // 保持原有的updateStatus函数（向后兼容）
    if (typeof window.updateStatus === 'undefined') {
        window.updateStatus = StatusUtils.updateStatus.bind(StatusUtils);
    }
}

