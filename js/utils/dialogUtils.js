/**
 * 对话框工具模块
 * 提供自定义对话框功能
 */

const DialogUtils = {
    /**
     * 自定义警告框（替代 alert()）
     * @param {string} message - 警告信息
     * @returns {Promise<void>}
     */
    alert(message) {
        return new Promise((resolve) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // 创建对话框
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: white;
                border-radius: 8px;
                padding: 24px;
                min-width: 300px;
                max-width: 500px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            `;

            // 创建内容
            dialog.innerHTML = `
                <div style="margin-bottom: 20px; color: #374151; font-size: 14px; line-height: 1.5;">
                    ${message.replace(/\n/g, '<br>')}
                </div>
                <div style="display: flex; justify-content: flex-end;">
                    <button id="alertDialogConfirm" 
                            style="padding: 8px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                        确定
                    </button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const confirmBtn = dialog.querySelector('#alertDialogConfirm');

            const handleClose = () => {
                document.body.removeChild(overlay);
                resolve();
            };

            confirmBtn.addEventListener('click', handleClose);
            
            // 按 Enter 或 Esc 关闭
            const handleKeyDown = (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    window.removeEventListener('keydown', handleKeyDown);
                    handleClose();
                }
            };
            window.addEventListener('keydown', handleKeyDown);

            // 聚焦按钮
            setTimeout(() => confirmBtn.focus(), 100);
        });
    },

    /**
     * 自定义输入对话框（替代 prompt()）
     * @param {string} message - 提示信息
     * @param {string} defaultValue - 默认值
     * @returns {Promise<string|null>} 用户输入的值，取消时返回 null
     */
    showInputDialog(message, defaultValue = '') {
        return new Promise((resolve) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // 创建对话框
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: white;
                border-radius: 8px;
                padding: 24px;
                min-width: 400px;
                max-width: 600px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            `;

            // 创建内容
            dialog.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                        ${message}
                    </label>
                    <input type="text" id="inputDialogInput" 
                           value="${defaultValue.replace(/"/g, '&quot;')}" 
                           style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                           autofocus>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 8px;">
                    <button id="inputDialogCancel" 
                            style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        取消
                    </button>
                    <button id="inputDialogConfirm" 
                            style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        确定
                    </button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const input = dialog.querySelector('#inputDialogInput');
            const confirmBtn = dialog.querySelector('#inputDialogConfirm');
            const cancelBtn = dialog.querySelector('#inputDialogCancel');

            // 确认按钮
            const handleConfirm = () => {
                const value = input.value.trim();
                document.body.removeChild(overlay);
                resolve(value || null);
            };

            // 取消按钮
            const handleCancel = () => {
                document.body.removeChild(overlay);
                resolve(null);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);

            // 按 Enter 确认，按 Esc 取消
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                }
            });

            // 点击遮罩层关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            });

            // 聚焦输入框
            setTimeout(() => {
                input.focus();
                input.select();
            }, 100);
        });
    }
};

// 暴露到全局作用域（向后兼容）
if (typeof window !== 'undefined') {
    window.DialogUtils = DialogUtils;
    // 保持原有的showInputDialog函数（向后兼容）
    if (typeof window.showInputDialog === 'undefined') {
        window.showInputDialog = DialogUtils.showInputDialog.bind(DialogUtils);
    }
}

