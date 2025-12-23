/**
 * 人员管理模块
 * 负责人员信息的查看、编辑和历史记录管理
 */

const StaffManager = {
    currentView: 'configs', // 'configs' 或 'staffList' 或 'staffDetail'
    currentConfigId: null, // 当前查看的配置ID
    originalStaffDataHistory: null, // 保存的原始人员数据，用于返回时恢复
    originalConfigSnapshot: null, // 保存的原始配置快照，用于返回时恢复
    originalConfigName: null, // 保存的原始配置名称，用于判断是否需要创建新配置
    originalScheduleConfig: null, // 保存的原始排班配置，用于判断是否需要创建新配置

    /**
     * 显示人员管理页面（配置记录列表）
     */
    showStaffManagement() {
        try {
            console.log('StaffManager.showStaffManagement() 被调用');
            this.currentView = 'configs';
            this.currentConfigId = null;
            
            // 保存视图状态到Store（但不覆盖激活状态）
            if (typeof Store !== 'undefined') {
                // 只更新视图相关状态，不更新激活状态
                Store.state.currentView = 'staff';
                Store.state.currentSubView = 'configs';
                Store.state.currentConfigId = null;
                // 注意：不调用 saveState()，避免在页面加载时覆盖激活状态
            }
            
            // 检查Store是否存在
            if (typeof Store === 'undefined') {
                console.error('Store未定义');
                throw new Error('状态管理模块未加载');
            }
            
            // 检查scheduleTable元素是否存在
            const scheduleTable = document.getElementById('scheduleTable');
            if (!scheduleTable) {
                console.error('scheduleTable元素未找到');
                throw new Error('页面元素未找到');
            }
            
            console.log('开始渲染配置列表');
            this.renderConfigList();
            console.log('配置列表渲染完成');
        } catch (error) {
            console.error('showStaffManagement执行失败:', error);
            const scheduleTable = document.getElementById('scheduleTable');
            if (scheduleTable) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-500">
                        <p class="text-lg font-bold">加载失败</p>
                        <p class="mt-2">${error.message}</p>
                        <p class="mt-4 text-sm text-gray-500">请查看控制台获取详细信息</p>
                    </div>
                `;
            }
            throw error;
        }
    },

    /**
     * 渲染配置记录列表
     */
    renderConfigList() {
        try {
            console.log('renderConfigList开始执行');
            const scheduleTable = document.getElementById('scheduleTable');
            if (!scheduleTable) {
                console.error('scheduleTable元素未找到');
                return;
            }
            
            // 检查Store是否存在
            if (typeof Store === 'undefined') {
                console.error('Store未定义');
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-500">
                        <p>状态管理模块未加载</p>
                    </div>
                `;
                return;
            }

            const configs = Store.getStaffConfigs();
            // 直接从 state 对象读取激活状态，确保获取最新值
            const activeConfigId = Store.state.activeConfigId;
            
            console.log('配置数量:', configs.length, '激活配置ID:', activeConfigId);
            console.log('Store.state.activeConfigId:', Store.state.activeConfigId);
            console.log('Store.getState("activeConfigId"):', Store.getState('activeConfigId'));
            
            // 如果没有任何配置，显示提示和范例下载
            if (!configs || configs.length === 0) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center">
                        <div class="max-w-md mx-auto">
                            <div class="mb-6">
                                <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h3 class="text-lg font-medium text-gray-900 mb-2">请上传人员配置</h3>
                            <p class="text-sm text-gray-500 mb-6">请先上传人员配置数据，然后才能进行后续操作。</p>
                            <div class="flex flex-col items-center space-y-3">
                                <button onclick="StaffManager.createNewConfig()" 
                                        class="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                                    上传人员配置
                                </button>
                                <button onclick="StaffManager.downloadTemplate()" 
                                        class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                                    下载标准范例
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

        let html = `
            <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">人员配置管理</h2>
                    <div class="flex items-center space-x-2">
                        <button onclick="StaffManager.createNewConfig()" 
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            新建
                        </button>
                        <button onclick="StaffManager.importConfig()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            导入
                        </button>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        `;

        if (configs.length === 0) {
            html += `
                <div class="p-8 text-center text-gray-400">
                    <p>暂无配置记录</p>
                    <p class="mt-2 text-sm">点击"新建"或"导入"创建第一个配置</p>
                </div>
            `;
        } else {
            html += `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置名称</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">人员数量</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最晚修改时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;

            // 按创建时间倒序排列
            const sortedConfigs = [...configs].sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            sortedConfigs.forEach((config, index) => {
                const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                const isActive = config.configId === activeConfigId;
                const staffCount = config.staffDataSnapshot ? config.staffDataSnapshot.length : 0;

                // 去掉配置名称中的YYYYMM-前缀
                const displayName = config.name.replace(/^\d{6}-/, '');
                
                html += `
                    <tr class="${rowClass} ${isActive ? 'ring-2 ring-blue-500' : ''}">
                        <td class="px-4 py-3 whitespace-nowrap">
                            <div class="flex items-center">
                                <span class="text-sm font-medium text-gray-900">${displayName}</span>
                                ${isActive ? '<span class="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">当前</span>' : ''}
                            </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${staffCount} 人</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.createdAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.updatedAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${isActive ? '<span class="text-green-600 font-medium">激活</span>' : '<span class="text-gray-400">未激活</span>'}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <div class="flex items-center space-x-2">
                                ${!isActive ? `
                                    <button onclick="StaffManager.activateConfig('${config.configId}')" 
                                            class="text-blue-600 hover:text-blue-800 font-medium">
                                        激活
                                    </button>
                                ` : ''}
                                <button onclick="StaffManager.viewConfig('${config.configId}')" 
                                        class="text-blue-600 hover:text-blue-800 font-medium">
                                    查看
                                </button>
                                <button onclick="StaffManager.editConfigName('${config.configId}')" 
                                        class="text-yellow-600 hover:text-yellow-800 font-medium">
                                    重命名
                                </button>
                                <button onclick="StaffManager.duplicateConfig('${config.configId}')" 
                                        class="text-green-600 hover:text-green-800 font-medium">
                                    复制
                                </button>
                                <button onclick="StaffManager.deleteConfig('${config.configId}')" 
                                        class="text-red-600 hover:text-red-800 font-medium">
                                    删除
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;
        }

            html += `
                </div>
            </div>
        `;

            console.log('准备设置innerHTML，HTML长度:', html.length);
            scheduleTable.innerHTML = html;
            console.log('renderConfigList执行完成');
        } catch (error) {
            console.error('renderConfigList执行失败:', error);
            const scheduleTable = document.getElementById('scheduleTable');
            if (scheduleTable) {
                scheduleTable.innerHTML = `
                    <div class="p-8 text-center text-red-500">
                        <p class="text-lg font-bold">渲染失败</p>
                        <p class="mt-2">${error.message}</p>
                        <p class="mt-4 text-sm text-gray-500">错误详情：${error.stack || '无详细信息'}</p>
                        <p class="mt-4 text-sm text-gray-500">请查看控制台获取详细信息</p>
                    </div>
                `;
            }
            throw error;
        }
    },

    /**
     * 创建新配置（触发文件上传）
     */
    createNewConfig() {
        // 创建隐藏的文件输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.xlsx,.xls,.csv';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }

            // 验证文件类型
            const validExtensions = ['.xlsx', '.xls', '.csv'];
            const fileName = file.name.toLowerCase();
            const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
            
            if (!isValidExtension) {
                alert('请上传 Excel 文件（.xlsx 或 .xls）或 CSV 文件（.csv）');
                document.body.removeChild(fileInput);
                return;
            }

            try {
                // 显示加载状态
                updateStatus('正在处理文件...', 'info');
                
                // 处理文件（会清理不在文件中的员工数据）
                const processedStaffData = await DataLoader.processFile(file);
                
                // 创建配置记录（使用文件中的数据，而不是内存中的所有数据）
                // 注意：由于 processFile 已经清理了不在文件中的数据，getCurrentStaffData 现在应该只包含文件中的数据
                const configId = Store.createStaffConfig();
                
                // 保存到IndexedDB
                await this.saveToIndexedDB();
                
                // 更新界面
                this.renderConfigList();
                
                // 检查是否有错误
                if (DataLoader.lastUploadErrors && DataLoader.lastUploadErrors.length > 0) {
                    updateStatus(`配置创建成功，但发现 ${DataLoader.lastUploadErrors.length} 条错误，请查看人员列表`, 'error');
                    // 如果当前在查看配置，刷新列表并高亮错误
                    if (this.currentConfigId === configId) {
                        await this.viewConfig(configId);
                    }
                } else {
                    updateStatus('配置创建成功', 'success');
                }
                
            } catch (error) {
                console.error('文件处理失败:', error);
                updateStatus('文件处理失败：' + error.message, 'error');
                alert('文件处理失败：' + error.message);
            } finally {
                document.body.removeChild(fileInput);
            }
        });
        
        // 触发文件选择
        document.body.appendChild(fileInput);
        fileInput.click();
    },

    /**
     * 查看配置详情（显示人员列表）
     * @param {string} configId - 配置ID
     */
    async viewConfig(configId) {
        const config = Store.getStaffConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        // 保存原始人员数据和配置快照（用于返回时恢复）
        this.originalStaffDataHistory = JSON.parse(JSON.stringify(Store.getState('staffDataHistory')));
        // 保存原始配置快照
        if (config.staffDataSnapshot) {
            this.originalConfigSnapshot = JSON.parse(JSON.stringify(config.staffDataSnapshot));
        } else {
            this.originalConfigSnapshot = null;
        }

        // 设置当前激活的配置（但不保存，避免在查看时触发保存）
        // 注意：激活配置应该在用户明确操作时才保存，而不是在查看时
        Store.state.activeConfigId = configId;
        // 不调用 setActiveConfig，因为它会触发保存
        // await Store.setActiveConfig(configId);
        // await this.saveToIndexedDB();

        this.currentView = 'staffList';
        this.currentConfigId = configId;
        
        // 保存视图状态到Store（但不保存，避免在返回时触发保存）
        if (typeof Store !== 'undefined') {
            Store.updateState({
                currentView: 'staff',
                currentSubView: 'staffList',
                currentConfigId: configId
            }, false); // 不自动保存
        }
        
        // 加载配置的人员数据快照到staffDataHistory
        if (config.staffDataSnapshot) {
            const tempStaffHistory = {};
            const baseTimestamp = Date.now();
            config.staffDataSnapshot.forEach((staff, index) => {
                const staffId = staff.staffId || staff.id;
                if (!tempStaffHistory[staffId]) {
                    tempStaffHistory[staffId] = [];
                }
                // 为每个员工创建临时版本记录，并确保versionId唯一
                const versionId = `temp_${staffId}_${baseTimestamp}_${index}`;
                tempStaffHistory[staffId].push({
                    data: { ...staff, versionId }, // 将versionId添加到staff数据中
                    createdAt: new Date().toISOString(),
                    expiresAt: null,
                    isValid: true,
                    versionId: versionId
                });
            });
            Store.state.staffDataHistory = tempStaffHistory;
            
            // 更新配置快照中的versionId，确保renderStaffList时能正确获取
            config.staffDataSnapshot = config.staffDataSnapshot.map((staff, index) => {
                const staffId = staff.staffId || staff.id;
                const versionId = `temp_${staffId}_${baseTimestamp}_${index}`;
                return { ...staff, versionId };
            });
        }
        
        await this.renderStaffList(config.staffDataSnapshot || []);
    },

    /**
     * 编辑配置名称
     * @param {string} configId - 配置ID
     */
    async editConfigName(configId) {
        const config = Store.getStaffConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        // 使用自定义输入对话框替代 prompt()
        const newName = await showInputDialog('请输入新的配置名称：', config.name);
        if (!newName || newName.trim() === '') {
            return;
        }

        try {
            Store.updateStaffConfig(configId, { name: newName.trim() }, true); // 重命名时立即保存
            await this.saveToIndexedDB();
            this.renderConfigList();
            updateStatus('配置名称已更新', 'success');
        } catch (error) {
            alert('更新失败：' + error.message);
        }
    },

    /**
     * 复制配置（复制后自动为非激活状态）
     * @param {string} configId - 配置ID
     */
    async duplicateConfig(configId) {
        try {
            Store.duplicateStaffConfig(configId);
            await this.saveToIndexedDB();
            this.renderConfigList();
            updateStatus('配置已复制（新配置为非激活状态）', 'success');
        } catch (error) {
            alert('复制失败：' + error.message);
        }
    },

    /**
     * 激活配置
     * @param {string} configId - 配置ID
     */
    async activateConfig(configId) {
        try {
            // 先设置激活状态
            await Store.setActiveConfig(configId);
            // 然后保存所有数据到IndexedDB（包括配置记录）
            await this.saveToIndexedDB();
            // 最后渲染配置列表
            this.renderConfigList();
            updateStatus('配置已激活', 'success');
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },

    /**
     * 删除配置（允许删除激活状态的配置）
     * @param {string} configId - 配置ID
     */
    async deleteConfig(configId) {
        const config = Store.getStaffConfig(configId);
        const isActive = config && config.configId === Store.getState('activeConfigId');
        const configs = Store.getStaffConfigs();
        
        // 如果是激活状态，提示用户
        let confirmMessage = '确定要删除这个配置吗？此操作不可恢复。';
        if (isActive) {
            if (configs.length === 1) {
                confirmMessage = '这是最后一个配置，删除后将没有激活的配置。确定要删除吗？此操作不可恢复。';
            } else {
                confirmMessage = '这是当前激活的配置，删除后将自动取消激活。确定要删除吗？此操作不可恢复。';
            }
        }
        
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            Store.deleteStaffConfig(configId);
            // 从IndexedDB删除
            if (typeof DB !== 'undefined' && DB.db) {
                await DB.deleteConfig(configId);
            }
            await this.saveToIndexedDB();
            
            // 如果删除后没有配置了，重置当前视图
            const remainingConfigs = Store.getStaffConfigs();
            if (remainingConfigs.length === 0) {
                this.currentConfigId = null;
            }
            
            this.renderConfigList();
            updateStatus('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    },

    /**
     * 导入配置（从Excel/CSV文件导入）
     */
    importConfig() {
        console.log('StaffManager.importConfig 被调用');
        try {
            // 创建隐藏的文件输入框
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.xlsx,.xls,.csv';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    document.body.removeChild(fileInput);
                    return;
                }

                // 验证文件类型
                const validExtensions = ['.xlsx', '.xls', '.csv'];
                const fileName = file.name.toLowerCase();
                const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
                
                if (!isValidExtension) {
                    alert('请上传 Excel 文件（.xlsx 或 .xls）或 CSV 文件（.csv）');
                    document.body.removeChild(fileInput);
                    return;
                }

                try {
                    // 显示加载状态
                    updateStatus('正在处理文件...', 'info');
                    
                    // 处理文件
                    await DataLoader.processFile(file);
                    
                    // 创建配置记录
                    const configId = Store.createStaffConfig();
                    
                    // 保存到IndexedDB
                    await this.saveToIndexedDB();
                    
                    // 更新界面
                    this.renderConfigList();
                    
                    // 检查是否有错误
                    if (DataLoader.lastUploadErrors && DataLoader.lastUploadErrors.length > 0) {
                        const errorMsg = DataLoader.lastUploadErrors.join('\n');
                        alert('文件处理完成，但有部分错误：\n\n' + errorMsg);
                    } else {
                        updateStatus('文件导入成功', 'success');
                    }
                } catch (error) {
                    console.error('文件处理失败:', error);
                    alert('文件处理失败：' + error.message);
                    updateStatus('文件处理失败', 'error');
                } finally {
                    document.body.removeChild(fileInput);
                }
            });
            
            document.body.appendChild(fileInput);
            fileInput.click();
        } catch (error) {
            console.error('importConfig 失败:', error);
            alert('导入失败：' + error.message);
        }
    },

    /**
     * 渲染人员列表（支持内联编辑）
     * @param {Array} staffList - 人员列表
     */
    async renderStaffList(staffList) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        // 加载积分公式配置
        let scoreFormula = {};
        if (typeof DB !== 'undefined' && DB.db) {
            scoreFormula = await DB.loadScoreFormula();
        } else {
            // 默认公式
            scoreFormula = {
                springFestivalCoeff: 10,
                nationalDayCoeff: 8,
                currentHolidayCoeff: 5
            };
        }

        // 获取当前配置名称（去掉YYYYMM-前缀）
        let currentConfigName = '未命名配置';
        if (this.currentConfigId) {
            const config = Store.getStaffConfig(this.currentConfigId);
            if (config && config.name) {
                currentConfigName = config.name.replace(/^\d{6}-/, '');
            }
        }
        
        // 保存原始配置名称和排班周期（用于判断是否需要创建新配置）
        if (this.currentConfigId && !this.originalConfigName) {
            const config = Store.getStaffConfig(this.currentConfigId);
            if (config) {
                this.originalConfigName = config.name;
                // 从当前排班配置获取
                const scheduleConfig = Store.getState('scheduleConfig');
                if (scheduleConfig && scheduleConfig.year && scheduleConfig.month) {
                    this.originalScheduleConfig = {
                        year: scheduleConfig.year,
                        month: scheduleConfig.month
                    };
                }
            }
        }
        
        let html = `
            <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-xl font-bold text-gray-800">人员列表</h2>
                        <span class="text-sm text-gray-500">-</span>
                        <input type="text" 
                               id="staffConfigNameInput" 
                               value="${currentConfigName}"
                               class="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                               style="width: 40ch;"
                               placeholder="输入配置名称"
                               onblur="updateStaffConfigName()"
                               onkeypress="if(event.key === 'Enter') { this.blur(); }">
                    </div>
                    <div class="flex items-center space-x-2">
                        <!-- 1. 积分公式配置 -->
                        <button onclick="StaffManager.showScoreFormulaConfig()" 
                                class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm">
                            积分公式配置
                        </button>
                        <!-- 2. 人员列表导出 -->
                        <button onclick="StaffManager.showExportDialog()" 
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm">
                            人员列表导出
                        </button>
                        <!-- 3. 配置校验并保存 -->
                        <button onclick="StaffManager.validateAndSave()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">
                            配置校验并保存
                        </button>
                        <!-- 4. 返回配置列表 -->
                        <button onclick="StaffManager.backToConfigList()" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm">
                            返回配置列表
                        </button>
                    </div>
                </div>

                <!-- 积分公式显示 -->
                <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <span class="text-sm font-medium text-gray-700">积分计算公式：</span>
                            <span class="text-sm text-gray-600">
                                积分 = 上年春节×<span id="formulaSpringCoeff" class="font-semibold text-blue-600">${scoreFormula.springFestivalCoeff}</span> + 
                                上年国庆×<span id="formulaNationalCoeff" class="font-semibold text-blue-600">${scoreFormula.nationalDayCoeff}</span> + 
                                当年节假×<span id="formulaHolidayCoeff" class="font-semibold text-blue-600">${scoreFormula.currentHolidayCoeff}</span>
                            </span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <button onclick="StaffManager.addNewStaff()" 
                                    class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm">
                                新增员工
                            </button>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow-sm overflow-x-auto" style="max-height: calc(100vh - 300px); overflow-y: auto;">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">姓名</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">性别</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">人员类型</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">归属地</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">技能</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">大夜是否可排</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">上下半月偏好</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">上个月大夜天数</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">上年春节</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">上年国庆</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">当年节假</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">积分</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
        `;

        if (staffList.length === 0) {
            html += `
                <tr>
                    <td colspan="13" class="px-4 py-8 text-center text-gray-400">
                        暂无人员数据
                    </td>
                </tr>
            `;
        } else {
            staffList.forEach((staff, index) => {
                const staffId = staff.staffId || staff.id;
                const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                const versionId = staff.versionId;
                
                html += `
                    <tr class="${rowClass}" data-staff-id="${staffId}" data-version-id="${versionId}">
                        <td class="px-3 py-2 text-sm text-gray-900">
                            <span class="cursor-pointer hover:text-blue-600 hover:underline" 
                                  onclick="StaffManager.showDeleteConfirm('${staffId}')"
                                  title="点击删除此员工">
                                ${staff.id}
                            </span>
                            <button id="deleteBtn_${staffId}" 
                                    onclick="StaffManager.deleteStaff('${staffId}')" 
                                    class="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors hidden"
                                    title="确认删除">
                                删除
                            </button>
                        </td>
                        <td class="px-3 py-2">
                            <input type="text" value="${staff.name || ''}" 
                                   class="w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                   onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'name', this.value)">
                        </td>
                        <td class="px-3 py-2">
                            <select class="staff-select w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                    onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'gender', this.value)">
                                ${staff.gender === '男' ? '<option value="男" selected>男</option>' : '<option value="男">男</option>'}
                                ${staff.gender === '女' ? '<option value="女" selected>女</option>' : '<option value="女">女</option>'}
                            </select>
                        </td>
                        <td class="px-3 py-2">
                            <select class="staff-select w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                    onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'personType', this.value)">
                                ${staff.personType ? `<option value="${staff.personType}" selected>${staff.personType}</option>` : '<option value="" selected style="display:none;"></option>'}
                                ${!staff.personType || staff.personType !== '全人力侦测' ? '<option value="全人力侦测">全人力侦测</option>' : ''}
                                ${!staff.personType || staff.personType !== '半人力授权+侦测' ? '<option value="半人力授权+侦测">半人力授权+侦测</option>' : ''}
                                ${!staff.personType || staff.personType !== '全人力授权+大夜侦测' ? '<option value="全人力授权+大夜侦测">全人力授权+大夜侦测</option>' : ''}
                                ${!staff.personType || staff.personType !== '授权人员支援侦测+大夜授权' ? '<option value="授权人员支援侦测+大夜授权">授权人员支援侦测+大夜授权</option>' : ''}
                            </select>
                        </td>
                        <td class="px-3 py-2">
                            <select class="staff-select w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                    onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'location', this.value)">
                                ${staff.location ? `<option value="${staff.location}" selected>${staff.location}</option>` : '<option value="" selected style="display:none;"></option>'}
                                ${!staff.location || staff.location !== '上海' ? '<option value="上海">上海</option>' : ''}
                                ${!staff.location || staff.location !== '成都' ? '<option value="成都">成都</option>' : ''}
                            </select>
                        </td>
                        <td class="px-3 py-2">
                            <div class="flex flex-wrap gap-1">
                                ${this.renderSkillCheckboxes(staffId, versionId, staff.skills || [])}
                            </div>
                        </td>
                        <td class="px-3 py-2">
                            <select class="staff-select w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                    onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'canNightShift', this.value === '否' ? '否' : '')">
                                ${staff.canNightShift === '否' ? '<option value="否" selected>否</option>' : '<option value="" selected></option>'}
                                ${staff.canNightShift !== '否' ? '<option value="否">否</option>' : '<option value=""></option>'}
                            </select>
                        </td>
                        <td class="px-3 py-2">
                            <select class="staff-select w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                    id="menstrualPeriod_${staffId}"
                                    onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'menstrualPeriod', this.value)">
                                ${staff.menstrualPeriod === '上' ? '<option value="上" selected>上</option>' : '<option value="上">上</option>'}
                                ${staff.menstrualPeriod === '下' ? '<option value="下" selected>下</option>' : '<option value="下">下</option>'}
                                ${!staff.menstrualPeriod ? '<option value="" selected></option>' : '<option value=""></option>'}
                            </select>
                        </td>
                        <td class="px-3 py-2">
                            <input type="number" value="${staff.lastMonthNightShiftDays || 0}" 
                                   min="0" step="1"
                                   class="w-20 px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.updateStaffField('${staffId}', '${versionId}', 'lastMonthNightShiftDays', Math.max(0, parseInt(this.value) || 0))">
                        </td>
                        <td class="px-3 py-2">
                            <input type="number" value="${staff.lastYearSpringFestival || 0}" 
                                   min="0" step="1"
                                   class="w-20 px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.updateStaffFieldAndRecalcScore('${staffId}', '${versionId}', 'lastYearSpringFestival', Math.max(0, parseInt(this.value) || 0))">
                        </td>
                        <td class="px-3 py-2">
                            <input type="number" value="${staff.lastYearNationalDay || 0}" 
                                   min="0" step="1"
                                   class="w-20 px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.updateStaffFieldAndRecalcScore('${staffId}', '${versionId}', 'lastYearNationalDay', Math.max(0, parseInt(this.value) || 0))">
                        </td>
                        <td class="px-3 py-2">
                            <input type="number" value="${staff.currentYearHolidays || 0}" 
                                   min="0" step="1"
                                   class="w-20 px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.updateStaffFieldAndRecalcScore('${staffId}', '${versionId}', 'currentYearHolidays', Math.max(0, parseInt(this.value) || 0))">
                        </td>
                        <td class="px-3 py-2">
                            <span class="text-sm font-semibold text-blue-600" id="score_${staffId}">${staff.priorityScore || 0}</span>
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                        </tbody>
                    </table>
                </div>
                <div class="mt-4 text-sm text-gray-600">
                    共 ${staffList.length} 条有效人员记录
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 渲染技能复选框
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {Array} currentSkills - 当前技能数组
     * @returns {string} HTML字符串
     */
    renderSkillCheckboxes(staffId, versionId, currentSkills) {
        const validSkills = ['网', '天', '微', '银B', '追', '毛'];
        return validSkills.map(skill => {
            const isChecked = currentSkills.includes(skill);
            return `
                <label class="flex items-center space-x-1 cursor-pointer">
                    <input type="checkbox" value="${skill}" 
                           ${isChecked ? 'checked' : ''}
                           onchange="StaffManager.updateStaffSkills('${staffId}', '${versionId}', this)"
                           class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                    <span class="text-xs text-gray-700">${skill}</span>
                </label>
            `;
        }).join('');
    },

    /**
     * 显示人员详情（包含历史记录）
     * @param {string} staffId - 人员ID
     */
    showStaffDetail(staffId) {
        const history = Store.getStaffHistory(staffId);
        const currentRecord = history.find(r => r.isValid && 
            (!r.expiresAt || new Date(r.expiresAt) > new Date()));

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        let html = `
            <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">人员详情</h2>
                    <button onclick="StaffManager.showStaffManagement()" 
                            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm">
                        返回列表
                    </button>
                </div>

                <!-- 当前信息 -->
                <div class="bg-white rounded-lg shadow-sm p-6 mb-4">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">当前信息</h3>
                    ${currentRecord ? this.renderStaffInfo(currentRecord.data, currentRecord) : '<p class="text-gray-400">暂无有效信息</p>'}
                    ${currentRecord ? `
                        <div class="mt-4 flex space-x-2">
                            <button onclick="StaffManager.editStaffRecord('${staffId}', '${currentRecord.versionId}')" 
                                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">
                                编辑当前信息
                            </button>
                        </div>
                    ` : ''}
                </div>

                <!-- 历史记录 -->
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">历史记录</h3>
                    <div class="space-y-4">
        `;

        if (history.length === 0) {
            html += '<p class="text-gray-400">暂无历史记录</p>';
        } else {
            // 按创建时间倒序排列
            const sortedHistory = [...history].sort((a, b) => 
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            sortedHistory.forEach((record, index) => {
                const isCurrent = record.versionId === (currentRecord && currentRecord.versionId);
                const isExpired = record.expiresAt && new Date(record.expiresAt) < new Date();
                const isValid = record.isValid && !isExpired;

                html += `
                    <div class="border ${isCurrent ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} rounded-lg p-4">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center space-x-2">
                                <span class="text-sm font-medium text-gray-700">版本 ${index + 1}</span>
                                ${isCurrent ? '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">当前</span>' : ''}
                                ${!isValid ? '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">已失效</span>' : ''}
                                ${isExpired ? '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">已过期</span>' : ''}
                            </div>
                            <div class="text-xs text-gray-500">
                                创建时间: ${this.formatDateTime(record.createdAt)}
                            </div>
                        </div>
                        ${this.renderStaffInfo(record.data, record, true)}
                        <div class="mt-3 flex space-x-2">
                            <button onclick="StaffManager.editStaffRecord('${staffId}', '${record.versionId}')" 
                                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs">
                                编辑
                            </button>
                            <button onclick="StaffManager.setExpiresAt('${staffId}', '${record.versionId}')" 
                                    class="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors text-xs">
                                设置失效时间
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                    </div>
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 渲染人员信息
     * @param {Object} data - 人员数据
     * @param {Object} record - 记录信息（包含版本信息）
     * @param {boolean} showVersionInfo - 是否显示版本信息
     */
    renderStaffInfo(data, record, showVersionInfo = false) {
        let html = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs text-gray-500">ID</label>
                    <p class="text-sm font-medium text-gray-900">${data.id || ''}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">姓名</label>
                    <p class="text-sm font-medium text-gray-900">${data.name || ''}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">性别</label>
                    <p class="text-sm text-gray-700">${data.gender || ''}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">人员类型</label>
                    <p class="text-sm text-gray-700">${data.personType || '未设置'}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">归属地</label>
                    <p class="text-sm text-gray-700">${data.location || '未设置'}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">技能</label>
                    <p class="text-sm text-gray-700">${data.skills ? data.skills.join(', ') : '无'}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">大夜是否可排</label>
                    <p class="text-sm text-gray-700">${data.canNightShift === '否' ? '否' : ''}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">上下半月偏好</label>
                    <p class="text-sm text-gray-700">${data.menstrualPeriod || ''}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">上个月大夜天数</label>
                    <p class="text-sm text-gray-700">${data.lastMonthNightShiftDays || 0}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">上年春节上班天数</label>
                    <p class="text-sm text-gray-700">${data.lastYearSpringFestival || 0}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">上年国庆上班天数</label>
                    <p class="text-sm text-gray-700">${data.lastYearNationalDay || 0}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">当年节假上班天数</label>
                    <p class="text-sm text-gray-700">${data.currentYearHolidays || 0}</p>
                </div>
                <div>
                    <label class="text-xs text-gray-500">积分</label>
                    <p class="text-sm font-semibold text-blue-600">${data.priorityScore || 0}</p>
                </div>
        `;

        if (showVersionInfo && record) {
            html += `
                <div>
                    <label class="text-xs text-gray-500">失效时间</label>
                    <p class="text-sm text-gray-700">${record.expiresAt ? this.formatDateTime(record.expiresAt) : '永久有效'}</p>
                </div>
            `;
        }

        html += `</div>`;

        return html;
    },

    /**
     * 编辑人员记录
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     */
    editStaffRecord(staffId, versionId) {
        const history = Store.getStaffHistory(staffId);
        const record = history.find(r => r.versionId === versionId);
        if (!record) {
            alert('记录不存在');
            return;
        }

        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const data = record.data;
        let html = `
            <div class="p-4">
                <h2 class="text-xl font-bold text-gray-800 mb-4">编辑人员信息</h2>
                <form id="editStaffForm" class="bg-white rounded-lg shadow-sm p-6">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">ID</label>
                            <input type="text" id="editId" value="${data.id || ''}" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                            <input type="text" id="editName" value="${data.name || ''}" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">性别</label>
                            <select id="editGender" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="男" ${data.gender === '男' ? 'selected' : ''}>男</option>
                                <option value="女" ${data.gender === '女' ? 'selected' : ''}>女</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">人员类型</label>
                            <select id="editPersonType" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="">未设置</option>
                                <option value="全人力侦测" ${data.personType === '全人力侦测' ? 'selected' : ''}>全人力侦测</option>
                                <option value="半人力授权+侦测" ${data.personType === '半人力授权+侦测' ? 'selected' : ''}>半人力授权+侦测</option>
                                <option value="全人力授权+大夜侦测" ${data.personType === '全人力授权+大夜侦测' ? 'selected' : ''}>全人力授权+大夜侦测</option>
                                <option value="授权人员支援侦测+大夜授权" ${data.personType === '授权人员支援侦测+大夜授权' ? 'selected' : ''}>授权人员支援侦测+大夜授权</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">归属地</label>
                            <select id="editLocation" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="">未设置</option>
                                <option value="上海" ${data.location === '上海' ? 'selected' : ''}>上海</option>
                                <option value="成都" ${data.location === '成都' ? 'selected' : ''}>成都</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">技能（用逗号分隔）</label>
                            <input type="text" id="editSkills" value="${data.skills ? data.skills.join(',') : ''}" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" 
                                   placeholder="网,天,微,银B,追,毛">
                            <p class="mt-1 text-xs text-gray-500">可选：网、天、微、银B、追、毛</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">大夜是否可排</label>
                            <select id="editCanNightShift" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="" ${data.canNightShift !== '否' ? 'selected' : ''}></option>
                                <option value="否" ${data.canNightShift === '否' ? 'selected' : ''}>否</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">上下半月偏好</label>
                            <select id="editMenstrualPeriod" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="" ${!data.menstrualPeriod ? 'selected' : ''}></option>
                                <option value="上" ${data.menstrualPeriod === '上' ? 'selected' : ''}>上</option>
                                <option value="下" ${data.menstrualPeriod === '下' ? 'selected' : ''}>下</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">上个月大夜天数</label>
                            <input type="number" id="editLastMonthNightShiftDays" value="${data.lastMonthNightShiftDays || 0}" 
                                   min="0" step="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                   oninput="if(this.value < 0) this.value = 0;">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">上年春节上班天数</label>
                            <input type="number" id="editLastYearSpringFestival" value="${data.lastYearSpringFestival || 0}" 
                                   min="0" step="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.calculatePriorityScore()">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">上年国庆上班天数</label>
                            <input type="number" id="editLastYearNationalDay" value="${data.lastYearNationalDay || 0}" 
                                   min="0" step="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.calculatePriorityScore()">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">当年节假上班天数</label>
                            <input type="number" id="editCurrentYearHolidays" value="${data.currentYearHolidays || 0}" 
                                   min="0" step="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                   oninput="if(this.value < 0) this.value = 0;"
                                   onchange="StaffManager.calculatePriorityScore()">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">积分（自动计算）</label>
                            <input type="number" id="editPriorityScore" value="${data.priorityScore || 0}" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50" 
                                   readonly title="积分 = 上年春节×10 + 上年国庆×8 + 当年节假×5">
                        </div>
                    </div>
                    <div class="mt-6 flex space-x-3">
                        <button type="submit" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                            保存
                        </button>
                        <button type="button" onclick="StaffManager.showStaffDetail('${staffId}')" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                            取消
                        </button>
                    </div>
                </form>
            </div>
        `;

        scheduleTable.innerHTML = html;

        // 绑定表单提交事件
        const form = document.getElementById('editStaffForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveStaffEdit(staffId, versionId);
            });
        }
    },

    /**
     * 处理性别变更（已移除，现在所有性别都可以配置上下半月偏好）
     */
    handleGenderChange() {
        // 已移除限制，所有性别都可以配置上下半月偏好
    },

    /**
     * 计算积分（根据积分规则自动计算）
     */
    calculatePriorityScore() {
        const lastYearSpringFestivalEl = document.getElementById('editLastYearSpringFestival');
        const lastYearNationalDayEl = document.getElementById('editLastYearNationalDay');
        const currentYearHolidaysEl = document.getElementById('editCurrentYearHolidays');
        // 确保天数不能为负数
        const lastYearSpringFestival = Math.max(0, parseInt(lastYearSpringFestivalEl && lastYearSpringFestivalEl.value) || 0);
        const lastYearNationalDay = Math.max(0, parseInt(lastYearNationalDayEl && lastYearNationalDayEl.value) || 0);
        const currentYearHolidays = Math.max(0, parseInt(currentYearHolidaysEl && currentYearHolidaysEl.value) || 0);
        
        // 积分计算规则：上年春节×10 + 上年国庆×8 + 当年节假×5
        const priorityScore = (lastYearSpringFestival * 10) + 
                             (lastYearNationalDay * 8) + 
                             (currentYearHolidays * 5);
        
        const scoreInput = document.getElementById('editPriorityScore');
        if (scoreInput) {
            scoreInput.value = priorityScore;
        }
    },

    /**
     * 保存编辑
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     */
    async saveStaffEdit(staffId, versionId) {
        // 重新计算积分
        this.calculatePriorityScore();
        
        const gender = document.getElementById('editGender').value;
        const skillsInput = document.getElementById('editSkills').value.split(',').map(s => s.trim()).filter(s => s);
        // 验证技能值（只允许：网、天、微、银B、追、毛）
        const validSkills = ['网', '天', '微', '银B', '追', '毛'];
        const skills = skillsInput.filter(skill => validSkills.includes(skill));
        
        // 获取天数输入值并验证不能为负数
        const lastMonthNightShiftDays = Math.max(0, parseInt(document.getElementById('editLastMonthNightShiftDays').value) || 0);
        const lastYearSpringFestival = Math.max(0, parseInt(document.getElementById('editLastYearSpringFestival').value) || 0);
        const lastYearNationalDay = Math.max(0, parseInt(document.getElementById('editLastYearNationalDay').value) || 0);
        const currentYearHolidays = Math.max(0, parseInt(document.getElementById('editCurrentYearHolidays').value) || 0);
        
        const updates = {
            id: document.getElementById('editId').value,
            name: document.getElementById('editName').value,
            gender: gender,
            personType: document.getElementById('editPersonType').value,
            location: document.getElementById('editLocation').value,
            skills: skills.length > 0 ? skills : ['网'], // 如果过滤后为空，设置默认值
            canNightShift: document.getElementById('editCanNightShift').value || '',
            menstrualPeriod: document.getElementById('editMenstrualPeriod').value || '',
            lastMonthNightShiftDays: lastMonthNightShiftDays,
            lastYearSpringFestival: lastYearSpringFestival,
            lastYearNationalDay: lastYearNationalDay,
            currentYearHolidays: currentYearHolidays,
            priorityScore: parseInt(document.getElementById('editPriorityScore').value) || 0
        };

        try {
            Store.updateStaffHistory(staffId, versionId, updates);
            
            // 如果当前在查看配置记录，更新配置记录
            if (this.currentConfigId) {
                const currentStaff = Store.getCurrentStaffData();
                Store.updateStaffConfig(this.currentConfigId, {
                    staffDataSnapshot: currentStaff
                });
            }
            
            // 不自动保存到数据库，只有validateAndSave时才保存
            alert('保存成功！请点击"配置校验并保存"以保存到数据库');
            // 如果当前在查看配置，刷新人员列表
            if (this.currentConfigId) {
                const config = Store.getStaffConfig(this.currentConfigId);
                if (config) {
                    await this.renderStaffList(config.staffDataSnapshot || []);
                }
            }
        } catch (error) {
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 设置失效时间
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     */
    async setExpiresAt(staffId, versionId) {
        const history = Store.getStaffHistory(staffId);
        const record = history.find(r => r.versionId === versionId);
        if (!record) {
            alert('记录不存在');
            return;
        }

        const currentExpiresAt = record.expiresAt ? record.expiresAt.split('T')[0] : '';
        // 使用自定义输入对话框替代 prompt()
        const expiresAt = await showInputDialog('请输入失效时间（YYYY-MM-DD格式，留空表示永久有效）：', currentExpiresAt);

        if (!expiresAt) return; // 用户取消

        try {
            const expiresAtISO = expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null;
            Store.setHistoryExpiresAt(staffId, versionId, expiresAtISO);
            
            // 不自动保存到数据库，只有validateAndSave时才保存
            alert('失效时间设置成功！请点击"配置校验并保存"以保存更改');
            // 如果当前在查看配置，刷新人员列表
            if (this.currentConfigId) {
                const config = Store.getStaffConfig(this.currentConfigId);
                if (config) {
                    await this.renderStaffList(config.staffDataSnapshot || []);
                }
            }
        } catch (error) {
            alert('设置失败：' + error.message);
        }
    },


    /**
     * 更新人员字段（内联编辑）
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {string} field - 字段名
     * @param {*} value - 字段值
     */
    async updateStaffField(staffId, versionId, field, value) {
        try {
            // 验证天数字段不能为负数
            const daysFields = ['lastMonthNightShiftDays', 'lastYearSpringFestival', 'lastYearNationalDay', 'currentYearHolidays'];
            if (daysFields.includes(field)) {
                value = Math.max(0, parseInt(value) || 0);
            }
            // 检查版本ID是否是临时版本（以new_开头）
            if (versionId && versionId.startsWith('new_')) {
                // 临时版本，直接更新配置快照，不更新历史记录
                if (this.currentConfigId) {
                    const config = Store.getStaffConfig(this.currentConfigId);
                    const staffList = config.staffDataSnapshot || [];
                    const staffIndex = staffList.findIndex(s => (s.staffId || s.id) === staffId);
                    if (staffIndex !== -1) {
                        staffList[staffIndex][field] = value;
                        Store.updateStaffConfig(this.currentConfigId, {
                            staffDataSnapshot: staffList
                        });
                    }
                }
            } else {
                // 正常版本，先检查版本记录是否存在
                const history = Store.getStaffHistory(staffId);
                const record = history.find(r => r.versionId === versionId);
                
                if (!record) {
                    // 版本记录不存在，可能是临时版本（temp_开头）或配置快照中的版本，直接更新配置快照
                    if (this.currentConfigId) {
                        const config = Store.getStaffConfig(this.currentConfigId);
                        if (config && config.staffDataSnapshot) {
                            const staffList = config.staffDataSnapshot;
                            const staffIndex = staffList.findIndex(s => (s.staffId || s.id) === staffId);
                            if (staffIndex !== -1) {
                                staffList[staffIndex][field] = value;
                                Store.updateStaffConfig(this.currentConfigId, {
                                    staffDataSnapshot: staffList
                                });
                            }
                        }
                    }
                } else {
                    // 版本记录存在，更新历史记录
                    Store.updateStaffHistory(staffId, versionId, { [field]: value });
                    
                    // 如果当前在查看配置记录，更新配置记录
                    if (this.currentConfigId) {
                        const currentStaff = Store.getCurrentStaffData();
                        Store.updateStaffConfig(this.currentConfigId, {
                            staffDataSnapshot: currentStaff
                        });
                    }
                }
            }
            
            // 注意：不保存到IndexedDB，只有validateAndSave时才保存
        } catch (error) {
            console.error('更新失败:', error);
            alert('更新失败：' + error.message);
        }
    },

    /**
     * 更新字段并重新计算积分
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {string} field - 字段名
     * @param {*} value - 字段值
     */
    async updateStaffFieldAndRecalcScore(staffId, versionId, field, value) {
        try {
            // 验证天数字段不能为负数
            const daysFields = ['lastYearSpringFestival', 'lastYearNationalDay', 'currentYearHolidays'];
            if (daysFields.includes(field)) {
                value = Math.max(0, parseInt(value) || 0);
            }
            // 检查版本ID是否是临时版本（以new_开头）
            if (versionId && versionId.startsWith('new_')) {
                // 临时版本，直接更新配置快照
                if (this.currentConfigId) {
                    const config = Store.getStaffConfig(this.currentConfigId);
                    const staffList = config.staffDataSnapshot || [];
                    const staffIndex = staffList.findIndex(s => (s.staffId || s.id) === staffId);
                    if (staffIndex !== -1) {
                        staffList[staffIndex][field] = value;
                        // 重新计算积分
                        const formula = await DB.loadScoreFormula();
                        const priorityScore = 
                            (staffList[staffIndex].lastYearSpringFestival || 0) * (formula.springFestivalCoeff || 10) +
                            (staffList[staffIndex].lastYearNationalDay || 0) * (formula.nationalDayCoeff || 8) +
                            (staffList[staffIndex].currentYearHolidays || 0) * (formula.currentHolidayCoeff || 5);
                        staffList[staffIndex].priorityScore = priorityScore;
                        Store.updateStaffConfig(this.currentConfigId, {
                            staffDataSnapshot: staffList
                        });
                    }
                }
            } else {
                // 正常版本，先检查版本记录是否存在
                const history = Store.getStaffHistory(staffId);
                const record = history.find(r => r.versionId === versionId);
                
                if (!record) {
                    // 版本记录不存在，可能是临时版本（temp_开头）或配置快照中的版本，直接更新配置快照
                    if (this.currentConfigId) {
                        const config = Store.getStaffConfig(this.currentConfigId);
                        if (config && config.staffDataSnapshot) {
                            const staffList = config.staffDataSnapshot;
                            const staffIndex = staffList.findIndex(s => (s.staffId || s.id) === staffId);
                            if (staffIndex !== -1) {
                                staffList[staffIndex][field] = value;
                                // 重新计算积分
                                const formula = await DB.loadScoreFormula();
                                const priorityScore = 
                                    (staffList[staffIndex].lastYearSpringFestival || 0) * (formula.springFestivalCoeff || 10) +
                                    (staffList[staffIndex].lastYearNationalDay || 0) * (formula.nationalDayCoeff || 8) +
                                    (staffList[staffIndex].currentYearHolidays || 0) * (formula.currentHolidayCoeff || 5);
                                staffList[staffIndex].priorityScore = priorityScore;
                                Store.updateStaffConfig(this.currentConfigId, {
                                    staffDataSnapshot: staffList
                                });
                            }
                        }
                    }
                    return;
                }
                
                // 版本记录存在，更新历史记录
                Store.updateStaffHistory(staffId, versionId, { [field]: value });
                
                // 重新计算积分
                if (record) {
                    const formula = await DB.loadScoreFormula();
                    const priorityScore = 
                        (record.data.lastYearSpringFestival || 0) * (formula.springFestivalCoeff || 10) +
                        (record.data.lastYearNationalDay || 0) * (formula.nationalDayCoeff || 8) +
                        (record.data.currentYearHolidays || 0) * (formula.currentHolidayCoeff || 5);
                    
                    Store.updateStaffHistory(staffId, versionId, { priorityScore: priorityScore });
                    
                    // 更新界面显示
                    const scoreElement = document.getElementById(`score_${staffId}`);
                    if (scoreElement) {
                        scoreElement.textContent = priorityScore;
                    }
                }
                
                // 如果当前在查看配置记录，更新配置记录
                if (this.currentConfigId) {
                    const currentStaff = Store.getCurrentStaffData();
                    Store.updateStaffConfig(this.currentConfigId, {
                        staffDataSnapshot: currentStaff
                    });
                }
            }
            
            // 注意：不保存到IndexedDB，只有validateAndSave时才保存
            
            // 刷新列表以显示新的积分
            const config = Store.getStaffConfig(this.currentConfigId);
            if (config && config.staffDataSnapshot) {
                await this.renderStaffList(config.staffDataSnapshot);
            }
        } catch (error) {
            console.error('更新失败:', error);
            alert('更新失败：' + error.message);
        }
    },

    /**
     * 更新技能（复选框）
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {HTMLElement} checkbox - 复选框元素
     */
    async updateStaffSkills(staffId, versionId, checkbox) {
        try {
            const history = Store.getStaffHistory(staffId);
            const record = history.find(r => r.versionId === versionId);
            if (!record) return;

            const currentSkills = record.data.skills || [];
            const skill = checkbox.value;
            const isChecked = checkbox.checked;

            let newSkills;
            if (isChecked) {
                // 添加技能
                if (!currentSkills.includes(skill)) {
                    newSkills = [...currentSkills, skill];
                } else {
                    newSkills = currentSkills;
                }
            } else {
                // 移除技能
                newSkills = currentSkills.filter(s => s !== skill);
            }

            // 如果没有技能，默认全选
            if (newSkills.length === 0) {
                newSkills = ['网', '天', '微', '银B', '追', '毛'];
                // 选中所有复选框
                const checkboxes = document.querySelectorAll(`input[type="checkbox"][onchange*="updateStaffSkills('${staffId}'"]`);
                checkboxes.forEach(cb => cb.checked = true);
            }

            Store.updateStaffHistory(staffId, versionId, { skills: newSkills });
            
            // 如果当前在查看配置记录，更新配置记录（但不保存到数据库）
            if (this.currentConfigId) {
                const currentStaff = Store.getCurrentStaffData();
                Store.updateStaffConfig(this.currentConfigId, {
                    staffDataSnapshot: currentStaff
                });
            }
            
            // 不自动保存到数据库，只有validateAndSave时才保存
        } catch (error) {
            console.error('更新技能失败:', error);
            alert('更新失败：' + error.message);
        }
    },

    /**
     * 处理性别变更（在列表中）
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {string} gender - 新性别
     */
    async handleGenderChangeInList(staffId, versionId, gender) {
        // 已移除限制，所有性别都可以配置上下半月偏好
    },

    /**
     * 显示积分公式配置对话框
     */
    async showScoreFormulaConfig() {
        const formula = await DB.loadScoreFormula();
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        let html = `
            <div class="p-4">
                <h2 class="text-xl font-bold text-gray-800 mb-4">积分计算公式配置</h2>
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <form id="scoreFormulaForm">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    积分 = 上年春节×<span class="text-blue-600">系数1</span> + 上年国庆×<span class="text-blue-600">系数2</span> + 当年节假×<span class="text-blue-600">系数3</span>
                                </label>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">上年春节系数</label>
                                <input type="number" id="formulaSpringCoeff" value="${formula.springFestivalCoeff}" 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" min="0" step="0.1">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">上年国庆系数</label>
                                <input type="number" id="formulaNationalCoeff" value="${formula.nationalDayCoeff}" 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" min="0" step="0.1">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">当年节假系数</label>
                                <input type="number" id="formulaHolidayCoeff" value="${formula.currentHolidayCoeff}" 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" min="0" step="0.1">
                            </div>
                        </div>
                        <div class="mt-6 flex space-x-3">
                            <button type="submit" 
                                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                                保存并重新计算
                            </button>
                            <button type="button" onclick="StaffManager.viewConfig('${this.currentConfigId || ''}')" 
                                    class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        scheduleTable.innerHTML = html;

        // 绑定表单提交事件
        const form = document.getElementById('scoreFormulaForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveScoreFormula();
            });
        }
    },

    /**
     * 保存积分公式配置并重新计算所有人员积分
     */
    async saveScoreFormula() {
        try {
            const springCoeff = parseFloat(document.getElementById('formulaSpringCoeff').value) || 10;
            const nationalCoeff = parseFloat(document.getElementById('formulaNationalCoeff').value) || 8;
            const holidayCoeff = parseFloat(document.getElementById('formulaHolidayCoeff').value) || 5;

            const formula = {
                springFestivalCoeff: springCoeff,
                nationalDayCoeff: nationalCoeff,
                currentHolidayCoeff: holidayCoeff
            };

            // 保存到数据库
            if (typeof DB !== 'undefined' && DB.db) {
                await DB.saveScoreFormula(formula);
            }

            // 重新计算所有人员的积分
            const staffDataHistory = Store.getState('staffDataHistory');
            Object.keys(staffDataHistory).forEach(staffId => {
                const history = staffDataHistory[staffId];
                history.forEach(record => {
                    if (record.isValid) {
                        const priorityScore = 
                            (record.data.lastYearSpringFestival || 0) * springCoeff +
                            (record.data.lastYearNationalDay || 0) * nationalCoeff +
                            (record.data.currentYearHolidays || 0) * holidayCoeff;
                        record.data.priorityScore = priorityScore;
                    }
                });
            });

            Store.saveState();
            // 保存积分公式配置（这是配置操作，需要保存）
            await this.saveToIndexedDB();
            
            // 如果当前在查看配置，刷新列表
            if (this.currentConfigId) {
                const config = Store.getStaffConfig(this.currentConfigId);
                if (config) {
                    await this.renderStaffList(config.staffDataSnapshot || []);
                }
            }

            updateStatus('积分公式已更新，所有人员积分已重新计算', 'success');
        } catch (error) {
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 保存到IndexedDB
     */
    async saveToIndexedDB() {
        try {
            // 确保激活状态被包含在保存的状态中
            const currentState = Store.getState();
            console.log('saveToIndexedDB: 保存前的激活状态 - activeConfigId:', currentState.activeConfigId, 'activeRequestConfigId:', currentState.activeRequestConfigId);
            
            // 保存应用状态（包括激活状态）
            await DB.saveAppState(currentState);
            
            // 保存人员数据历史
            const staffDataHistory = Store.getState('staffDataHistory');
            for (const [staffId, history] of Object.entries(staffDataHistory)) {
                await DB.saveStaffHistory(staffId, history);
            }
            
            // 保存配置记录
            const configs = Store.getStaffConfigs();
            for (const config of configs) {
                await DB.saveConfig(config);
            }
            
            console.log('saveToIndexedDB: 保存完成 - activeConfigId:', currentState.activeConfigId, 'activeRequestConfigId:', currentState.activeRequestConfigId);
        } catch (error) {
            console.error('保存到数据库失败:', error);
        }
    },

    /**
     * 导出人员列表
     * @param {string} format - 导出格式：'xlsx', 'csv', 'xls'
     */
    async exportStaffList(format = 'xlsx') {
        if (!this.currentConfigId) {
            alert('请先选择一个配置');
            return;
        }

        const config = Store.getStaffConfig(this.currentConfigId);
        if (!config || !config.staffDataSnapshot || config.staffDataSnapshot.length === 0) {
            alert('当前配置没有人员数据');
            return;
        }

        const staffList = config.staffDataSnapshot;
        
        // 获取当前配置名称（优先使用输入框中的值）
        let exportConfigName = config.name || '人员列表';
        const configNameInput = document.getElementById('staffConfigNameInput');
        if (configNameInput && configNameInput.value.trim()) {
            exportConfigName = configNameInput.value.trim();
        }

        // 准备导出数据
        const headers = [
            'ID', '姓名', '性别', '人员类型', '归属地', '技能', 
            '大夜是否可排', '上下半月偏好', '上个月大夜天数', 
            '上年春节', '上年国庆', '当年节假', '积分'
        ];

        const data = staffList.map(staff => [
            staff.id || '',
            staff.name || '',
            staff.gender || '',
            staff.personType || '',
            staff.location || '',
            (staff.skills || []).join(','),
            staff.canNightShift === '否' ? '否' : '',
            staff.menstrualPeriod || '',
            staff.lastMonthNightShiftDays || 0,
            staff.lastYearSpringFestival || 0,
            staff.lastYearNationalDay || 0,
            staff.currentYearHolidays || 0,
            staff.priorityScore || 0
        ]);

        // 创建工作表
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
        
        // 设置列宽
        const colWidths = [
            { wch: 10 }, // ID
            { wch: 12 }, // 姓名
            { wch: 8 },  // 性别
            { wch: 20 }, // 人员类型
            { wch: 10 }, // 归属地
            { wch: 15 }, // 技能
            { wch: 12 }, // 大夜是否可排
            { wch: 12 }, // 上下半月偏好
            { wch: 15 }, // 上个月大夜天数
            { wch: 12 }, // 上年春节
            { wch: 12 }, // 上年国庆
            { wch: 12 }, // 当年节假
            { wch: 10 }  // 积分
        ];
        worksheet['!cols'] = colWidths;

        // 创建工作簿
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '人员列表');

        // 根据格式导出
        let fileName = `${exportConfigName}.${format}`;
        let mimeType;
        let fileData;

        if (format === 'csv') {
            // CSV格式
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            fileData = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            mimeType = 'text/csv';
        } else if (format === 'xls') {
            // XLS格式（旧版Excel）
            fileData = XLSX.write(workbook, { 
                type: 'array', 
                bookType: 'xls' 
            });
            mimeType = 'application/vnd.ms-excel';
        } else {
            // XLSX格式（默认）
            fileData = XLSX.write(workbook, { 
                type: 'array', 
                bookType: 'xlsx' 
            });
            mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        }

        // 创建下载链接
        const url = format === 'csv' 
            ? URL.createObjectURL(fileData)
            : URL.createObjectURL(new Blob([fileData], { type: mimeType }));
        
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        updateStatus(`人员列表已导出为 ${format.toUpperCase()} 格式`, 'success');
    },

    /**
     * 显示导出格式选择对话框
     */
    async showExportDialog() {
        if (!this.currentConfigId) {
            alert('请先选择一个配置');
            return;
        }

        const config = Store.getStaffConfig(this.currentConfigId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        // 创建格式选择对话框
        const formatChoice = confirm(
            '请选择导出格式：\n\n' +
            '点击"确定"导出为 XLSX 格式（推荐）\n' +
            '点击"取消"选择其他格式'
        );

        if (formatChoice === null) return; // 用户取消

        let exportFormat = 'xlsx';
        
        if (!formatChoice) {
            // 用户点击了取消，显示其他格式选择
            // 使用自定义输入对话框替代 prompt()
            const otherFormat = await showInputDialog(
                '请选择导出格式：\n\n1. CSV (逗号分隔值)\n2. XLS (旧版Excel)\n\n请输入编号（1或2），或直接输入格式名称：',
                '1'
            );
            
            if (!otherFormat) return;
            
            if (otherFormat === '2' || otherFormat.toLowerCase() === 'xls') {
                exportFormat = 'xls';
            } else if (otherFormat === '1' || otherFormat.toLowerCase() === 'csv') {
                exportFormat = 'csv';
            }
        }

        await this.exportStaffList(exportFormat);
    },

    /**
     * 校验配置并保存
     */
    async validateAndSave() {
        if (!this.currentConfigId) {
            alert('请先选择一个配置');
            return;
        }

        const config = Store.getStaffConfig(this.currentConfigId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const staffList = config.staffDataSnapshot || [];
        const errors = [];
        const errorRows = [];

        // 校验每个员工
        staffList.forEach((staff, index) => {
            const rowErrors = [];
            const staffId = staff.staffId || staff.id;

            // 必填字段校验：ID、姓名、性别、人员类型、归属地
            if (!staff.id || String(staff.id).trim() === '') {
                rowErrors.push('ID不能为空');
            }
            if (!staff.name || String(staff.name).trim() === '') {
                rowErrors.push('姓名不能为空');
            }
            if (!staff.gender || (staff.gender !== '男' && staff.gender !== '女')) {
                rowErrors.push('性别必须为男或女');
            }
            if (!staff.personType || String(staff.personType).trim() === '') {
                rowErrors.push('人员类型不能为空');
            }
            if (!staff.location || String(staff.location).trim() === '') {
                rowErrors.push('归属地不能为空');
            }

            // 已移除性别限制，所有性别都可以配置上下半月偏好

            if (rowErrors.length > 0) {
                errors.push({
                    staffId: staffId,
                    staffName: staff.name || '',
                    errors: rowErrors
                });
                errorRows.push(index);
            }
        });

        // 检查ID重复
        const idMap = {};
        const duplicateRows = [];
        staffList.forEach((staff, index) => {
            const id = staff.id;
            if (id) {
                if (idMap[id]) {
                    // 找到重复的ID，标记所有重复的行
                    if (!errors.find(e => e.staffId === id && e.errors.includes('ID重复'))) {
                        errors.push({
                            staffId: id,
                            staffName: staff.name || '',
                            errors: ['ID重复']
                        });
                        duplicateRows.push(index);
                        // 也标记之前出现的行
                        const firstIndex = staffList.findIndex(s => s.id === id);
                        if (firstIndex !== -1 && firstIndex !== index) {
                            duplicateRows.push(firstIndex);
                        }
                    }
                } else {
                    idMap[id] = index;
                }
            }
        });
        
        // 合并重复行索引到errorRows
        duplicateRows.forEach(idx => {
            if (!errorRows.includes(idx)) {
                errorRows.push(idx);
            }
        });

        // 如果有错误，显示错误并询问是否强制保存
        if (errors.length > 0) {
            const errorMessage = errors.map(e => 
                `员工 ${e.staffName} (ID: ${e.staffId}):\n${e.errors.join('\n')}`
            ).join('\n\n');

            const shouldSave = confirm(
                `发现 ${errors.length} 个错误：\n\n${errorMessage}\n\n是否强制保存？\n\n点击"确定"强制保存，点击"取消"取消保存。`
            );

            if (!shouldSave) {
                // 高亮错误行
                this.highlightErrors(errorRows);
                return;
            }
        }

        // 保存配置
        try {
            // 检查排班周期是否改变
            const currentScheduleConfig = Store.getState('scheduleConfig');
            const originalYear = this.originalScheduleConfig ? this.originalScheduleConfig.year : null;
            const originalMonth = this.originalScheduleConfig ? this.originalScheduleConfig.month : null;
            const currentYear = currentScheduleConfig ? currentScheduleConfig.year : null;
            const currentMonth = currentScheduleConfig ? currentScheduleConfig.month : null;
            
            const isScheduleChanged = originalYear !== currentYear || originalMonth !== currentMonth;
            const config = Store.getStaffConfig(this.currentConfigId);
            const currentConfigName = config ? config.name : null;
            
            let targetConfigId = this.currentConfigId;
            
            // 如果排班周期改变了，需要创建新配置
            if (isScheduleChanged && currentYear && currentMonth) {
                // 生成新配置名称：YYYYMM-原配置名称
                const yearMonthPrefix = `${currentYear}${String(currentMonth).padStart(2, '0')}`;
                const originalName = this.originalConfigName || currentConfigName || '未命名配置';
                
                // 如果原名称已经包含YYYYMM前缀，则替换；否则添加前缀
                const nameMatch = originalName.match(/^(\d{6})[-_](.+)$/);
                let newName;
                if (nameMatch) {
                    // 如果原名称有前缀，替换为新前缀（使用-连接）
                    newName = `${yearMonthPrefix}-${nameMatch[2]}`;
                } else {
                    // 如果原名称没有前缀，添加新前缀（使用-连接）
                    newName = `${yearMonthPrefix}-${originalName}`;
                }
                
                // 创建新配置（使用Store.createStaffConfig，它会自动使用当前的人员数据）
                const newConfigId = Store.createStaffConfig(newName);
                
                // 不自动激活新配置，保持当前配置不变
                // await Store.setActiveConfig(newConfigId); // 已移除自动激活
                targetConfigId = newConfigId;
                this.currentConfigId = newConfigId;
                
                console.log('排班周期已更改，已创建新配置:', { newConfigId, newName, originalYear, originalMonth, currentYear, currentMonth });
            } else {
                // 排班周期没有改变，更新现有配置
                // 如果配置名称被临时修改了，恢复原配置名称
                if (this.originalConfigName && config && config.name !== this.originalConfigName) {
                    Store.updateStaffConfig(this.currentConfigId, {
                        name: this.originalConfigName,
                        staffDataSnapshot: staffList,
                        updatedAt: new Date().toISOString()
                    }, false); // 不自动保存
                } else {
                    Store.updateStaffConfig(this.currentConfigId, {
                        staffDataSnapshot: staffList,
                        updatedAt: new Date().toISOString()
                    }, false); // 不自动保存
                }
                
                // 同步到Store的人员数据历史（不自动保存，稍后统一保存）
                staffList.forEach(staff => {
                    const staffId = staff.staffId || staff.id;
                    if (staffId) {
                        const history = Store.getStaffHistory(staffId);
                        if (history.length > 0) {
                            // 更新最新记录
                            const latestRecord = history[history.length - 1];
                            Store.updateStaffHistory(staffId, latestRecord.versionId, staff, null, false); // 不自动保存
                        } else {
                            // 创建新记录（不自动保存，稍后统一保存）
                            Store.addStaffData(staff, null, false); // 不自动保存
                        }
                    }
                });
            }

            // 保存到数据库（只有这里才真正保存，只保存到浏览器，不导出文件）
            await this.saveToIndexedDB();
            
            // 清除错误高亮
            this.highlightErrors([]);

            updateStatus(errors.length > 0 ? '配置已强制保存（存在错误）' : '配置校验通过并已保存', errors.length > 0 ? 'error' : 'success');
            
            // 清理保存的原始数据（因为已经保存，不需要恢复）
            this.originalStaffDataHistory = null;
            
            // 保存成功后，延迟300ms后自动返回配置列表
            setTimeout(() => {
                this.showStaffManagement();
            }, 300);
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 高亮错误行
     * @param {Array<number>} errorRows - 错误行索引数组
     */
    highlightErrors(errorRows) {
        // 先清除所有错误高亮
        const allRows = document.querySelectorAll('tbody tr[data-staff-id]');
        allRows.forEach(row => {
            row.classList.remove('error-row');
            row.style.backgroundColor = '';
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
                cell.classList.remove('error-cell');
            });
        });
        
        // 高亮错误行
        const rows = document.querySelectorAll('tbody tr[data-staff-id]');
        rows.forEach((row, index) => {
            if (errorRows.includes(index)) {
                row.classList.add('error-row');
                row.style.backgroundColor = '#fee2e2';
                // 高亮ID单元格
                const idCell = row.querySelector('td:first-child');
                if (idCell) {
                    idCell.classList.add('error-cell');
                }
            }
        });
    },

    /**
     * 新增员工
     */
    async addNewStaff() {
        if (!this.currentConfigId) {
            alert('请先选择一个配置');
            return;
        }

        // 使用自定义输入对话框替代 prompt()
        const newId = await showInputDialog('请输入新员工的ID：', '');
        if (!newId || newId.trim() === '') {
            return;
        }

        // 检查ID是否已存在
        const config = Store.getStaffConfig(this.currentConfigId);
        const existingStaff = (config.staffDataSnapshot || []).find(s => s.id === newId.trim());
        if (existingStaff) {
            alert('该ID已存在，请使用其他ID');
            return;
        }

        // 创建新员工数据（默认值：技能全部，天数0，生理期空，大夜可排）
        const newStaff = {
            id: newId.trim(),
            name: '',
            gender: '男',
            personType: '',
            location: '',
            skills: ['网', '天', '微', '银B', '追', '毛'], // 默认所有技能
            canNightShift: '', // 默认可排（留空表示可排）
            menstrualPeriod: '', // 默认空
            lastMonthNightShiftDays: 0, // 默认0
            lastYearSpringFestival: 0, // 默认0
            lastYearNationalDay: 0, // 默认0
            currentYearHolidays: 0, // 默认0
            priorityScore: 0,
            staffId: newId.trim(),
            versionId: `new_${Date.now()}`
        };

        // 添加到配置快照
        const staffList = [...(config.staffDataSnapshot || []), newStaff];
        Store.updateStaffConfig(this.currentConfigId, {
            staffDataSnapshot: staffList
        });

        // 添加到Store（但不保存到数据库，只有validateAndSave时才保存）
        Store.addStaffData(newStaff);

        // 刷新列表
        await this.renderStaffList(staffList);
        
        // 跳转到最末尾
        setTimeout(() => {
            const tableContainer = document.querySelector('.bg-white.rounded-lg.shadow-sm.overflow-x-auto');
            if (tableContainer) {
                tableContainer.scrollTop = tableContainer.scrollHeight;
            }
            // 滚动到新添加的行
            const lastRow = document.querySelector(`tr[data-staff-id="${newId.trim()}"]`);
            if (lastRow) {
                // 兼容性处理：如果浏览器不支持smooth，使用auto
                if (lastRow.scrollIntoView) {
                    try {
                        lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch (e) {
                        lastRow.scrollIntoView();
                    }
                } else {
                    // 降级方案：直接滚动
                    lastRow.scrollIntoView();
                }
            }
        }, 100);
        
        updateStatus('新员工已添加，请填写必填信息后点击"配置校验并保存"', 'info');
    },

    /**
     * 显示删除确认
     * @param {string} staffId - 员工ID
     */
    showDeleteConfirm(staffId) {
        const deleteBtn = document.getElementById(`deleteBtn_${staffId}`);
        if (deleteBtn) {
            // 切换显示/隐藏
            if (deleteBtn.classList.contains('hidden')) {
                deleteBtn.classList.remove('hidden');
                // 3秒后自动隐藏
                setTimeout(() => {
                    deleteBtn.classList.add('hidden');
                }, 3000);
            } else {
                deleteBtn.classList.add('hidden');
            }
        }
    },

    /**
     * 下载标准范例文件
     */
    downloadTemplate() {
        try {
            // 创建标准范例数据
            const templateData = [
                ['人员ID', '人员姓名', '性别', '当前是否哺乳期', '固定技能-网', '固定技能-天', '固定技能-微', '人员类型', '归属地', '上年春节上班天数', '上年国庆上班天数', '当年节假上班天数', '生理期禁止排夜班时间段', '上月大夜天数'],
                ['001', '张三', '男', '否', '是', '是', '否', '全人力侦测', '上海', '3', '2', '1', '', '4'],
                ['002', '李四', '女', '否', '是', '否', '是', '半人力授权+侦测', '成都', '2', '3', '0', '上', '3'],
                ['003', '王五', '男', '否', '否', '是', '是', '全人力授权+大夜侦测', '上海', '4', '1', '2', '', '4'],
                ['004', '赵六', '女', '是', '是', '是', '否', '全人力侦测', '成都', '1', '2', '1', '', '0'],
            ];
            
            // 创建工作簿
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(templateData);
            
            // 设置列宽
            ws['!cols'] = [
                { wch: 10 }, // 人员ID
                { wch: 12 }, // 人员姓名
                { wch: 8 },  // 性别
                { wch: 15 }, // 当前是否哺乳期
                { wch: 12 }, // 固定技能-网
                { wch: 12 }, // 固定技能-天
                { wch: 12 }, // 固定技能-微
                { wch: 20 }, // 人员类型
                { wch: 10 }, // 归属地
                { wch: 15 }, // 上年春节上班天数
                { wch: 15 }, // 上年国庆上班天数
                { wch: 15 }, // 当年节假上班天数
                { wch: 20 }, // 生理期禁止排夜班时间段
                { wch: 12 }, // 上月大夜天数
            ];
            
            // 添加工作表
            XLSX.utils.book_append_sheet(wb, ws, '人员配置');
            
            // 生成文件名
            const fileName = `人员配置标准范例_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            // 下载文件
            XLSX.writeFile(wb, fileName);
            
            updateStatus('标准范例已下载', 'success');
        } catch (error) {
            console.error('下载范例失败:', error);
            alert('下载范例失败：' + error.message);
        }
    },

    /**
     * 删除员工
     * @param {string} staffId - 员工ID
     */
    async deleteStaff(staffId) {
        // 再次确认
        if (!confirm('确定要删除此员工吗？此操作不可恢复。')) {
            return;
        }

        if (!this.currentConfigId) {
            alert('配置不存在');
            return;
        }

        const config = Store.getStaffConfig(this.currentConfigId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        // 从配置快照中移除
        const staffList = (config.staffDataSnapshot || []).filter(s => (s.staffId || s.id) !== staffId);
        Store.updateStaffConfig(this.currentConfigId, {
            staffDataSnapshot: staffList
        });

        // 从Store中使该员工数据失效（但不保存到数据库，只有validateAndSave时才保存）
        const history = Store.getStaffHistory(staffId);
        if (history && history.length > 0) {
            history.forEach(record => {
                record.isValid = false;
            });
        }

        // 刷新列表（不保存到数据库）
        await this.renderStaffList(staffList);
        updateStatus('员工已删除，请点击"配置校验并保存"以保存更改', 'info');
    },

    /**
     * 格式化日期时间
     * @param {string} isoString - ISO日期字符串
     * @returns {string} 格式化后的字符串
     */
    formatDateTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * 返回配置列表（恢复原状态，不保存）
     */
    backToConfigList() {
        // 恢复原始人员数据和配置快照（取消当前所有更改）
        if (this.originalStaffDataHistory !== null) {
            Store.state.staffDataHistory = JSON.parse(JSON.stringify(this.originalStaffDataHistory));
            // 注意：不调用 saveState()，因为这是取消操作，不应该保存
        }
        
        // 恢复原始配置快照
        if (this.currentConfigId && this.originalConfigSnapshot !== null) {
            const config = Store.getStaffConfig(this.currentConfigId);
            if (config) {
                config.staffDataSnapshot = JSON.parse(JSON.stringify(this.originalConfigSnapshot));
                // 注意：不调用 saveState()，因为这是取消操作，不应该保存
            }
        }
        
        // 恢复原始配置名称（如果配置名称被临时修改了）
        if (this.originalConfigName && this.currentConfigId) {
            const config = Store.getStaffConfig(this.currentConfigId);
            if (config && config.name !== this.originalConfigName) {
                Store.updateStaffConfig(this.currentConfigId, {
                    name: this.originalConfigName
                }, false); // 不自动保存
            }
        }
        
        // 清理保存的原始数据
        this.originalStaffDataHistory = null;
        this.originalConfigSnapshot = null;
        this.originalConfigName = null;
        this.originalScheduleConfig = null;
        
        // 返回配置列表
        this.showStaffManagement();
    }
};

/**
 * 更新人员配置名称
 */
function updateStaffConfigName() {
    const configNameInput = document.getElementById('staffConfigNameInput');
    if (!configNameInput) {
        return;
    }
    
    const newName = configNameInput.value.trim();
    if (!newName) {
        alert('配置名称不能为空');
        configNameInput.value = '未命名配置';
        return;
    }
    
    // 更新配置名称
    if (typeof StaffManager !== 'undefined' && StaffManager.currentConfigId) {
        const config = Store.getStaffConfig(StaffManager.currentConfigId);
        if (config) {
            Store.updateStaffConfig(StaffManager.currentConfigId, {
                name: newName,
                updatedAt: new Date().toISOString()
            });
            Store.saveState();
            updateStatus('配置名称已更新', 'success');
            console.log('配置名称已更新为:', newName);
        }
    } else {
        console.warn('没有当前配置ID，无法保存配置名称');
    }
}

// 确保函数在全局作用域可用
if (typeof window !== 'undefined') {
    window.updateStaffConfigName = updateStaffConfigName;
}

// 导出（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffManager;
}

