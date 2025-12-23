/**
 * 排班周期管理模块
 * 负责排班周期配置的管理和月历标注
 */

const SchedulePeriodManager = {
    currentView: 'configs', // 'configs' | 'periodList'
    currentConfigId: null,
    
    /**
     * 显示排班周期管理主页面
     */
    async showSchedulePeriodManagement() {
        this.currentView = 'configs';
        this.currentConfigId = null;
        
        // 更新视图状态
        if (typeof Store !== 'undefined') {
            Store.updateState({
                currentView: 'schedulePeriod',
                currentSubView: 'configs',
                currentConfigId: null
            }, false);
        }
        
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }
        
        const configs = Store.getSchedulePeriodConfigs() || [];
        const activeConfigId = Store.getState('activeSchedulePeriodConfigId');
        
        let html = `
            <div class="p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">排班周期管理</h2>
                    <button onclick="SchedulePeriodManager.createNewConfig()" 
                            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                        新建
                    </button>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        `;
        
        if (configs.length === 0) {
            html += `
                <div class="p-8 text-center text-gray-400">
                    <p>暂无配置记录</p>
                    <p class="mt-2 text-sm">点击"新建"创建第一个配置</p>
                </div>
            `;
        } else {
            html += `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置名称</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总天数</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">工作日</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">休息日</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">周末</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">春节天数</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">十一天数</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">其他法定节假日</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">排班周期</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最晚修改时间</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;
            
            configs.forEach(config => {
                const isActive = config.configId === activeConfigId;
                const stats = this.calculatePeriodStats(config);
                
                html += `
                    <tr class="${isActive ? 'bg-blue-50' : ''}">
                        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${config.name}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.totalDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.workDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.totalRestDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.weekendDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.springFestivalDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.nationalDayDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${stats.otherHolidayDays}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${config.schedulePeriod || '未设置'}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.createdAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${this.formatDateTime(config.updatedAt)}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            ${isActive 
                                ? `<span class="px-2 py-1 rounded bg-green-500 text-white text-xs font-medium">已激活</span>`
                                : `<button onclick="SchedulePeriodManager.activateConfig('${config.configId}')" class="px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 text-xs font-medium">激活</button>`
                            }
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-2">
                            <button onclick="SchedulePeriodManager.viewConfig('${config.configId}')"
                                    class="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                                查看
                            </button>
                            <button onclick="SchedulePeriodManager.deleteConfig('${config.configId}')"
                                    class="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">
                                删除
                            </button>
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
        
        scheduleTable.innerHTML = html;
    },
    
    /**
     * 重命名配置
     */
    async renameConfig(configId) {
        const config = Store.getSchedulePeriodConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const defaultName = config.name || '';
        const name = await (typeof DialogUtils !== 'undefined' && typeof DialogUtils.showInputDialog === 'function'
            ? DialogUtils.showInputDialog('请输入新的配置名称：', defaultName)
            : prompt('请输入新的配置名称：', defaultName));

        if (!name || name.trim() === '') {
            return;
        }

        Store.updateSchedulePeriodConfig(configId, { name: name.trim() }, true);
        await this.saveToIndexedDB();
        await this.showSchedulePeriodManagement();

        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('配置名称已更新', 'success');
    },

    /**
     * 复制配置
     */
    async duplicateConfig(configId) {
        const config = Store.getSchedulePeriodConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const defaultName = `${config.name || '新配置'}-副本`;
        const name = await (typeof DialogUtils !== 'undefined' && typeof DialogUtils.showInputDialog === 'function'
            ? DialogUtils.showInputDialog('请输入副本名称：', defaultName)
            : prompt('请输入副本名称：', defaultName));

        if (!name || name.trim() === '') {
            return;
        }

        const newId = Store.createSchedulePeriodConfig(
            name.trim(),
            config.scheduleConfig ? JSON.parse(JSON.stringify(config.scheduleConfig)) : null,
            config.restDaysSnapshot ? JSON.parse(JSON.stringify(config.restDaysSnapshot)) : {}
        );

        // 立即保存并刷新列表
        await this.saveToIndexedDB();
        await this.showSchedulePeriodManagement();

        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('配置已复制', 'success');
    },

    /**
     * 生成日期列表
     */
    generateDateList(startDateStr, endDateStr) {
        const dateList = [];
        if (!startDateStr || !endDateStr) return dateList;
        
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const fixedHoliday = typeof HolidayManager !== 'undefined' 
                ? HolidayManager.isFixedHoliday(dateStr)
                : false;
            const lunarHoliday = typeof LunarHolidays !== 'undefined' ? LunarHolidays.getHoliday(dateStr) : null;
            const holidayName = (typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName)
                ? HolidayManager.getHolidayName(dateStr)
                : '';
            
            dateList.push({
                dateStr,
                date: new Date(currentDate),
                dayOfWeek,
                isWeekend,
                fixedHoliday,
                lunarHoliday,
                holidayName: holidayName || lunarHoliday || ''
            });
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return dateList;
    },
    
    /**
     * 计算排班周期统计信息
     * 与特殊节假日连续在一起的休息日，也应该被认定为特殊节假日
     */
    calculatePeriodStats(config) {
        const restDays = config.restDaysSnapshot || {};
        if (!config.scheduleConfig || !config.scheduleConfig.startDate || !config.scheduleConfig.endDate) {
            return {
                totalDays: 0,
                workDays: 0,
                totalRestDays: 0,
                weekendDays: 0,
                springFestivalDays: 0,
                nationalDayDays: 0,
                otherHolidayDays: 0
            };
        }
        
        const startDate = new Date(config.scheduleConfig.startDate);
        const endDate = new Date(config.scheduleConfig.endDate);
        
        // 前后各延伸一周用于连通性判断
        const extendedStartDate = new Date(startDate);
        extendedStartDate.setDate(extendedStartDate.getDate() - 7);
        const extendedEndDate = new Date(endDate);
        extendedEndDate.setDate(extendedEndDate.getDate() + 7);
        
        // 生成包含延伸的完整日期列表
        const fullDateList = this.generateDateList(
            extendedStartDate.toISOString().split('T')[0],
            extendedEndDate.toISOString().split('T')[0]
        );
        
        // 只统计排班周期内的日期
        const dateList = fullDateList.filter(info => {
            const date = new Date(info.dateStr);
            return date >= startDate && date <= endDate;
        });
        
        // 标记特殊节假日集合
        const specialHolidays = {
            springFestival: new Set(), // 春节
            nationalDay: new Set(),    // 国庆
            other: new Set()           // 其他法定节假日（元旦、清明、五一、端午、中秋）
        };
        
        fullDateList.forEach((info, idx) => {
            // 使用 HolidayManager 获取节假日名称
            const holidayName = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
                ? HolidayManager.getHolidayName(info.dateStr)
                : '';
            
            // 如果没有从 HolidayManager 获取到，尝试从 LunarHolidays 获取
            const lunarHoliday = !holidayName && typeof LunarHolidays !== 'undefined' && LunarHolidays.getHoliday
                ? LunarHolidays.getHoliday(info.dateStr)
                : null;
            
            const finalHolidayName = holidayName || lunarHoliday || '';
            
            // 注意：国庆包括10月1日到10月7日，但只有10月1日到10月3日是法定节假日
            // 这里我们只标记法定节假日部分（10月1日到10月3日）
            if (finalHolidayName === '春节') {
                specialHolidays.springFestival.add(info.dateStr);
            } else if (finalHolidayName === '国庆') {
                // 国庆：10月1日到10月3日是法定节假日
                const date = new Date(info.dateStr);
                const month = date.getMonth() + 1;
                const day = date.getDate();
                if (month === 10 && day >= 1 && day <= 3) {
                    specialHolidays.nationalDay.add(info.dateStr);
                }
            } else if (finalHolidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(finalHolidayName)) {
                specialHolidays.other.add(info.dateStr);
            }
        });
        
        // 计算休息日标志和特殊节假日标志
        const restFlags = fullDateList.map((info) => {
            const dateStr = info.dateStr;
            const hasExplicitRest = Object.prototype.hasOwnProperty.call(restDays, dateStr);
            return hasExplicitRest ? restDays[dateStr] === true : info.isWeekend;
        });
        
        const springFestivalFlags = fullDateList.map(info => specialHolidays.springFestival.has(info.dateStr));
        const nationalDayFlags = fullDateList.map(info => specialHolidays.nationalDay.has(info.dateStr));
        const otherHolidayFlags = fullDateList.map((info, idx) => {
            const isOtherHoliday = specialHolidays.other.has(info.dateStr);
            return isOtherHoliday;
        });
        
        // 计算连通性：与春节连通的休息日
        // 春节天数 = 春节本身（特殊节假日）+ 与春节连通的所有休息日
        // 连通性判断：从每个春节日期开始，向左右两侧连续检查所有休息日，直到遇到工作日才停止
        const connectedToSpringFestival = new Array(fullDateList.length).fill(false);
        // 从每个春节日期开始，向左右两侧连续检查所有休息日
        springFestivalFlags.forEach((v, startIdx) => { 
            if (v) {
                // 标记春节本身
                connectedToSpringFestival[startIdx] = true;
                
                // 向左连续检查所有休息日，直到遇到工作日
                for (let i = startIdx - 1; i >= 0; i--) {
                    if (restFlags[i]) {
                        connectedToSpringFestival[i] = true;
                    } else {
                        break; // 遇到工作日，停止
                    }
                }
                
                // 向右连续检查所有休息日，直到遇到工作日
                for (let i = startIdx + 1; i < fullDateList.length; i++) {
                    if (restFlags[i]) {
                        connectedToSpringFestival[i] = true;
                    } else {
                        break; // 遇到工作日，停止
                    }
                }
            }
        });
        
        // 计算连通性：与国庆连通的休息日
        // 十一天数 = 国庆本身（特殊节假日）+ 与国庆连通的所有休息日
        // 注意：优先级：春节 > 十一 > 其他
        // 如果某个日期已经被春节连通，则不再计入国庆
        // 连通性判断：从每个国庆日期开始，向左右两侧连续检查所有休息日，直到遇到工作日才停止
        const connectedToNationalDay = new Array(fullDateList.length).fill(false);
        // 从每个国庆日期开始，向左右两侧连续检查所有休息日
        nationalDayFlags.forEach((v, startIdx) => { 
            if (v) {
                // 如果这个国庆日期已经被春节连通，则跳过（优先级：春节 > 十一）
                if (connectedToSpringFestival[startIdx]) {
                    return; // 跳过，不计入国庆
                }
                
                // 标记国庆本身
                connectedToNationalDay[startIdx] = true;
                
                // 向左连续检查所有休息日，直到遇到工作日或遇到已被春节连通的日期
                for (let i = startIdx - 1; i >= 0; i--) {
                    // 如果遇到已被春节连通的日期，停止（不再继续向左）
                    if (connectedToSpringFestival[i]) {
                        break;
                    }
                    if (restFlags[i]) {
                        connectedToNationalDay[i] = true;
                    } else {
                        break; // 遇到工作日，停止
                    }
                }
                
                // 向右连续检查所有休息日，直到遇到工作日或遇到已被春节连通的日期
                for (let i = startIdx + 1; i < fullDateList.length; i++) {
                    // 如果遇到已被春节连通的日期，停止（不再继续向右）
                    if (connectedToSpringFestival[i]) {
                        break;
                    }
                    if (restFlags[i]) {
                        connectedToNationalDay[i] = true;
                    } else {
                        break; // 遇到工作日，停止
                    }
                }
            }
        });
        
        // 计算连通性：与其他法定节假日连通的休息日
        // 其他法定节假日天数 = 其他法定节假日本身（特殊节假日）+ 与其他法定节假日连通的所有休息日
        // 注意：优先级：春节 > 十一 > 其他
        // 如果某个日期已经被春节或国庆连通，则不再计入其他法定节假日
        // 连通性判断：从每个其他法定节假日日期开始，向左右两侧连续检查所有休息日，直到遇到工作日才停止
        const connectedToOther = new Array(fullDateList.length).fill(false);
        // 从每个其他法定节假日日期开始，向左右两侧连续检查所有休息日
        otherHolidayFlags.forEach((v, startIdx) => { 
            if (v) {
                // 如果这个其他法定节假日已经被春节或国庆连通，则跳过（优先级：春节 > 十一 > 其他）
                if (connectedToSpringFestival[startIdx] || connectedToNationalDay[startIdx]) {
                    return; // 跳过，不计入其他法定节假日
                }
                
                // 标记其他法定节假日本身（无论它是否是休息日，因为它是特殊节假日）
                // 这样即使其他法定节假日本身不是休息日，也能作为连通起点
                // 但如果它是休息日，它本身也会被计入统计
                connectedToOther[startIdx] = true;
                
                // 向左连续检查所有休息日，直到遇到工作日或遇到已被春节或国庆连通的日期
                for (let i = startIdx - 1; i >= 0; i--) {
                    // 如果遇到已被春节或国庆连通的日期，停止（不再继续向左）
                    if (connectedToSpringFestival[i] || connectedToNationalDay[i]) {
                        break;
                    }
                    if (restFlags[i]) {
                        connectedToOther[i] = true;
                    } else {
                        break; // 遇到工作日，停止
                    }
                }
                
                // 向右连续检查所有休息日，直到遇到工作日或遇到已被春节或国庆连通的日期
                for (let i = startIdx + 1; i < fullDateList.length; i++) {
                    // 如果遇到已被春节或国庆连通的日期，停止（不再继续向右）
                    if (connectedToSpringFestival[i] || connectedToNationalDay[i]) {
                        break;
                    }
                    if (restFlags[i]) {
                        connectedToOther[i] = true;
                    } else {
                        break; // 遇到工作日，停止
                    }
                }
            }
        });
        
        // 统计（只统计排班周期内的日期）
        // 计算优先级：总天数 > 春节天数 > 十一天数 > 其他法定节假日 > 周末 > 休息日 > 工作日
        let totalDays = dateList.length;
        let springFestivalDays = 0;
        let nationalDayDays = 0;
        let otherHolidayDays = 0;
        let weekendDays = 0;
        let totalRestDays = 0;
        let workDays = 0;
        
        // 标记已计入特殊节假日的日期
        const countedInSpecialHolidays = new Set();
        
        dateList.forEach((dateInfo, idx) => {
            // 找到在完整列表中的索引
            const fullIdx = fullDateList.findIndex(f => f.dateStr === dateInfo.dateStr);
            if (fullIdx < 0) return;
            
            const dateStr = dateInfo.dateStr;
            const isRestDay = restFlags[fullIdx];
            const isWeekend = dateInfo.isWeekend;
            
            // 获取节假日名称（用于判断是否是特殊节假日本身）
            // 优先使用fullDateList中已有的holidayName信息，如果没有再查询
            const holidayName = dateInfo.holidayName || 
                (typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
                    ? HolidayManager.getHolidayName(dateStr)
                    : '');
            const lunarHoliday = dateInfo.lunarHoliday || 
                (!holidayName && typeof LunarHolidays !== 'undefined' && LunarHolidays.getHoliday
                    ? LunarHolidays.getHoliday(dateStr)
                    : null);
            const finalHolidayName = holidayName || lunarHoliday || '';
            
            // 判断是否是特殊节假日本身（红色日期）
            const isSpringFestival = finalHolidayName === '春节';
            const isNationalDay = finalHolidayName === '国庆';
            const isOtherHoliday = finalHolidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(finalHolidayName);
            
            // 判断是否是固定假期（红色日期）
            const isFixedHoliday = typeof HolidayManager !== 'undefined' && HolidayManager.isFixedHoliday
                ? HolidayManager.isFixedHoliday(dateStr)
                : false;
            
            // 判断是否是红色日期：特殊节假日本身（无论是否是休息日）或与特殊节假日连通的休息日
            // 红色日期 = 特殊节假日本身 OR (休息日 AND 与特殊节假日连通)
            const isRedDate = isSpringFestival || isNationalDay || isOtherHoliday || isFixedHoliday || 
                             (isRestDay && (connectedToSpringFestival[fullIdx] || connectedToNationalDay[fullIdx] || connectedToOther[fullIdx]));
            
            // 1. 统计春节天数（优先级最高）
            if (isSpringFestival || connectedToSpringFestival[fullIdx]) {
                springFestivalDays++;
                countedInSpecialHolidays.add(dateStr);
            }
            // 2. 统计十一天数（优先级次之，排除已计入春节的）
            else if ((isNationalDay || connectedToNationalDay[fullIdx]) && !countedInSpecialHolidays.has(dateStr)) {
                nationalDayDays++;
                countedInSpecialHolidays.add(dateStr);
            }
            // 3. 统计其他法定节假日（优先级第三，排除已计入春节和十一的）
            else if ((isOtherHoliday || connectedToOther[fullIdx]) && !countedInSpecialHolidays.has(dateStr)) {
                otherHolidayDays++;
                countedInSpecialHolidays.add(dateStr);
            }
            // 4. 统计周末（排除已计入特殊节假日的）
            else if (isWeekend && isRestDay && !countedInSpecialHolidays.has(dateStr)) {
                weekendDays++;
                countedInSpecialHolidays.add(dateStr);
            }
        });
        
        // 5. 计算休息日 = 春节天数 + 十一天数 + 其他法定节假日 + 周末
        totalRestDays = springFestivalDays + nationalDayDays + otherHolidayDays + weekendDays;
        
        // 6. 计算工作日 = 总天数 - 休息日
        workDays = totalDays - totalRestDays;
        
        return {
            totalDays,
            workDays,
            totalRestDays,
            weekendDays,
            springFestivalDays,
            nationalDayDays,
            otherHolidayDays
        };
    },
    
    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    },
    
    /**
     * 创建新配置（弹窗选择年/月/日期/名称）
     */
    async createNewConfig() {
        try {
            // 获取当前排班周期
            let scheduleConfig = Store.getState('scheduleConfig');
            if (typeof ScheduleLockManager !== 'undefined') {
                const currentPeriod = ScheduleLockManager.getCurrentSchedulePeriod();
                scheduleConfig = {
                    startDate: currentPeriod.startDate,
                    endDate: currentPeriod.endDate,
                    year: currentPeriod.year,
                    month: currentPeriod.month
                };
            }
            
            if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
                alert('请先配置排班周期');
                return;
            }

            // 弹窗收集信息
            const dialogResult = await this.showCreateDialog(scheduleConfig);
            if (!dialogResult) return;

            const { year, month, startDate, endDate, name } = dialogResult;

            // 检查是否已存在该月份的配置
            const existingConfigs = Store.getSchedulePeriodConfigs() || [];
            const yearMonth = `${year}${String(month).padStart(2, '0')}`;
            const existing = existingConfigs.find(c => {
                const configYearMonth = c.scheduleConfig 
                    ? `${c.scheduleConfig.year}${String(c.scheduleConfig.month).padStart(2, '0')}`
                    : null;
                return configYearMonth === yearMonth;
            });
            
            if (existing) {
                alert(`该月份（${yearMonth}）的排班周期配置已存在，请先删除或编辑现有配置`);
                return;
            }

            // 检查开始和结束日期的唯一性
            const duplicate = existingConfigs.find(c => {
                return c.scheduleConfig && 
                    c.scheduleConfig.startDate === startDate && 
                    c.scheduleConfig.endDate === endDate;
            });
            if (duplicate) {
                alert(`该排班周期（${startDate} 至 ${endDate}）已存在于配置：${duplicate.name}`);
                return;
            }

            // 初始化休息日快照：周末默认休息 + 法定节假日默认休息
            const initialRestDays = {};
            const dateList = this.generateDateList(startDate, endDate);
            
            // 获取节假日信息
            const getHolidayNameFn = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
                ? HolidayManager.getHolidayName.bind(HolidayManager)
                : (dateStr) => {
                    const year = new Date(dateStr).getFullYear();
                    const holidays = typeof HolidayManager !== 'undefined' ? HolidayManager.getHolidays(year) : {};
                    return holidays[dateStr] || '';
                };
            
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const holidayName = dateInfo.holidayName || dateInfo.lunarHoliday || getHolidayNameFn(dateStr);
                
                // 1. 周末默认休息
                if (dateInfo.isWeekend) {
                    initialRestDays[dateStr] = true;
                }
                
                // 2. 法定节假日当天默认休息
                // 包括：元旦、清明、五一、端午、中秋
                if (holidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
                    initialRestDays[dateStr] = true;
                }
                
                // 3. 春节第一天及之后2天（共3天）默认休息
                if (holidayName === '春节') {
                    initialRestDays[dateStr] = true;
                }
                
                // 4. 国庆（10月1日）及之后2天（共3天）默认休息
                if (holidayName === '国庆') {
                    const date = new Date(dateStr);
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    // 10月1日到10月3日是法定节假日，默认休息
                    if (month === 10 && day >= 1 && day <= 3) {
                        initialRestDays[dateStr] = true;
                    }
                }
            });
            
            // 创建配置
            const configId = Store.createSchedulePeriodConfig(name, {
                startDate,
                endDate,
                year,
                month
            }, initialRestDays);
            
            // 激活该配置
            await Store.setActiveSchedulePeriodConfig(configId);
            
            // 保存到IndexedDB
            await this.saveToIndexedDB();
            
            // 显示配置详情
            this.viewConfig(configId);
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已创建', 'success');
        } catch (error) {
            console.error('createNewConfig 失败:', error);
            alert('创建失败：' + error.message);
        }
    },

    /**
     * 新建弹窗：选择年/月/日期并输入名称
     */
    async showCreateDialog(baseConfig) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50';

            // 预计算默认 name（不可编辑，使用 YYYYMM-排班周期配置）
            const yearMonth = `${baseConfig.year}${String(baseConfig.month).padStart(2, '0')}`;
            const defaultName = `${yearMonth}-排班周期配置`;

            // 计算日期
            const calcPeriod = (y, m) => {
                if (typeof DateCalculator !== 'undefined' && DateCalculator.calculateSchedulePeriod) {
                    const { startDate, endDate } = DateCalculator.calculateSchedulePeriod(y, m);
                    const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : (d => d.toISOString().split('T')[0]);
                    return {
                        startDate: formatFn(startDate),
                        endDate: formatFn(endDate)
                    };
                }
                const start = new Date(y, m - 2, 26);
                const end = new Date(y, m - 1, 25);
                const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : (d => d.toISOString().split('T')[0]);
                return { startDate: formatFn(start), endDate: formatFn(end) };
            };

            let currentYear = baseConfig.year;
            let currentMonth = baseConfig.month;
            let currentStart = baseConfig.startDate;
            let currentEnd = baseConfig.endDate;

            const dialog = document.createElement('div');
            dialog.className = 'bg-white rounded-lg shadow-lg w-full max-w-3xl p-6';
            dialog.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-800 mb-4">新建排班周期配置</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">年份</label>
                        <input type="number" id="sp-year" min="2020" max="2100" value="${currentYear}" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">月份</label>
                        <select id="sp-month" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            ${Array.from({length:12}, (_,i)=>{const m=i+1;return `<option value="${m}" ${m===currentMonth?'selected':''}>${m}月</option>`;}).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">开始日期</label>
                        <input type="date" id="sp-start" value="${currentStart}" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">结束日期</label>
                        <input type="date" id="sp-end" value="${currentEnd}" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-2">配置名称（自动生成）</label>
                        <input type="text" id="sp-name" value="${defaultName}" disabled
                               class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 text-gray-500 cursor-not-allowed">
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-3">
                    <button id="sp-cancel" class="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300">取消</button>
                    <button id="sp-ok" class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">确定并创建</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const yearInput = dialog.querySelector('#sp-year');
            const monthSelect = dialog.querySelector('#sp-month');
            const startInput = dialog.querySelector('#sp-start');
            const endInput = dialog.querySelector('#sp-end');
            const nameInput = dialog.querySelector('#sp-name');
            const cancelBtn = dialog.querySelector('#sp-cancel');
            const okBtn = dialog.querySelector('#sp-ok');

            const updateDates = () => {
                const y = parseInt(yearInput.value);
                const m = parseInt(monthSelect.value);
                if (!y || !m) return;
                const { startDate, endDate } = calcPeriod(y, m);
                startInput.value = startDate;
                endInput.value = endDate;
                // 更新默认名称
                const newName = `${y}${String(m).padStart(2,'0')}-排班周期配置`;
                nameInput.value = newName;
            };

            yearInput.addEventListener('change', updateDates);
            monthSelect.addEventListener('change', updateDates);

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });

            okBtn.addEventListener('click', () => {
                const y = parseInt(yearInput.value);
                const m = parseInt(monthSelect.value);
                const sd = startInput.value;
                const ed = endInput.value;
                const nm = `${y}${String(m).padStart(2,'0')}-排班周期配置`;

                if (!y || !m || !sd || !ed || !nm) {
                    alert('请完整填写信息');
                    return;
                }
                if (new Date(sd) > new Date(ed)) {
                    alert('开始日期不能晚于结束日期');
                    return;
                }

                document.body.removeChild(overlay);
                resolve({
                    year: y,
                    month: m,
                    startDate: sd,
                    endDate: ed,
                    name: nm
                });
            });
        });
    },
    
    /**
     * 查看配置详情
     */
    async viewConfig(configId) {
        const config = Store.getSchedulePeriodConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }
        
        this.currentConfigId = configId;
        this.currentView = 'periodList';
        this.prevActiveSchedulePeriodId = Store.getState('activeSchedulePeriodConfigId');
        this.wasActiveCurrent = this.prevActiveSchedulePeriodId === configId;
        
        // 加载配置的休息日数据到内存，但不改变激活状态
        const restDays = config.restDaysSnapshot || {};
        Store.state.restDays = JSON.parse(JSON.stringify(restDays));
        
        // 对于已存在的配置，如果restDaysSnapshot中没有法定节假日的标记，需要补充默认的法定节假日休息标记
        // 这样可以确保法定节假日默认显示为红色
        if (config.scheduleConfig && config.scheduleConfig.startDate && config.scheduleConfig.endDate) {
            const dateList = this.generateDateList(config.scheduleConfig.startDate, config.scheduleConfig.endDate);
            const getHolidayNameFn = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
                ? HolidayManager.getHolidayName.bind(HolidayManager)
                : (dateStr) => {
                    const year = new Date(dateStr).getFullYear();
                    const holidays = typeof HolidayManager !== 'undefined' ? HolidayManager.getHolidays(year) : {};
                    return holidays[dateStr] || '';
                };
            
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                // 如果这个日期没有显式标记，检查是否是法定节假日默认休息
                if (!Object.prototype.hasOwnProperty.call(Store.state.restDays, dateStr)) {
                    const holidayName = dateInfo.holidayName || dateInfo.lunarHoliday || getHolidayNameFn(dateStr);
                    
                    // 法定节假日当天默认休息
                    if (holidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
                        Store.state.restDays[dateStr] = true;
                    }
                    // 春节第一天及之后2天默认休息
                    else if (holidayName === '春节') {
                        Store.state.restDays[dateStr] = true;
                    }
                    // 国庆（10月1日）及之后2天默认休息
                    else if (holidayName === '国庆') {
                        const date = new Date(dateStr);
                        const month = date.getMonth() + 1;
                        const day = date.getDate();
                        if (month === 10 && day >= 1 && day <= 3) {
                            Store.state.restDays[dateStr] = true;
                        }
                    }
                }
            });
        }
        
        // 加载配置的排班周期到内存（不切换激活）
        if (config.scheduleConfig) {
            Store.updateState({
                scheduleConfig: JSON.parse(JSON.stringify(config.scheduleConfig))
            }, false);
        }

        // 记录初始快照用于重置
        this.initialRestDaysSnapshot = JSON.parse(JSON.stringify(Store.state.restDays));
        this.initialScheduleConfig = JSON.parse(JSON.stringify(Store.getState('scheduleConfig')));
        
        // 渲染配置详情页面（包含日历）
        await this.renderPeriodDetail(config);
    },
    
    /**
     * 渲染排班周期详情页面（包含月历）
     */
    async renderPeriodDetail(config) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) {
            return;
        }
        
        const scheduleConfig = config.scheduleConfig || Store.getState('scheduleConfig');
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            scheduleTable.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <p>排班周期未配置</p>
                </div>
            `;
            return;
        }
        
        // 生成日期列表（实际排班周期）
        const actualDateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        
        // 前后各延伸一周用于连通性判断
        const startDate = new Date(scheduleConfig.startDate);
        const endDate = new Date(scheduleConfig.endDate);
        const extendedStartDate = new Date(startDate);
        extendedStartDate.setDate(extendedStartDate.getDate() - 7);
        const extendedEndDate = new Date(endDate);
        extendedEndDate.setDate(extendedEndDate.getDate() + 7);
        
        // 生成包含延伸的完整日期列表
        const fullDateList = this.generateDateList(
            extendedStartDate.toISOString().split('T')[0],
            extendedEndDate.toISOString().split('T')[0]
        );
        
        // 标记哪些日期属于实际排班周期
        const actualDateSet = new Set(actualDateList.map(d => d.dateStr));
        fullDateList.forEach(info => {
            info.isInPeriod = actualDateSet.has(info.dateStr);
        });
        
        const restDays = Store.getAllRestDays();
        
        // 渲染页面（卡片日历，仅展示开始-结束范围）
        let html = `
            <div class="p-6 space-y-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800">${config.name}</h2>
                        <p class="text-sm text-gray-500 mt-1">${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}</p>
                        ${(() => {
                            // 检测当前排班周期内的特殊节假日
                            const holidaysInPeriod = [];
                            actualDateList.forEach(dateInfo => {
                                const holidayName = dateInfo.holidayName || dateInfo.lunarHoliday || '';
                                if (holidayName && !holidaysInPeriod.includes(holidayName)) {
                                    holidaysInPeriod.push(holidayName);
                                }
                            });
                            if (holidaysInPeriod.length > 0) {
                                return `<p class="text-xs text-orange-600 mt-1">⚠️ 当前周期包含特殊法定节假日：${holidaysInPeriod.join('、')}</p>`;
                            }
                            return '';
                        })()}
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="SchedulePeriodManager.resetCurrentConfig()" 
                                class="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 border border-gray-300 text-sm font-medium">
                            重置当前配置
                        </button>
                        <button onclick="SchedulePeriodManager.saveCurrentConfig()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            保存当前配置
                        </button>
                        <button onclick="SchedulePeriodManager.backToConfigList()" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                            返回配置列表
                        </button>
                    </div>
                </div>

                <!-- 日历卡片 -->
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-semibold text-gray-800">每日状态</h3>
                        <div class="flex items-center gap-3 text-xs">
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-50 border border-gray-300"></span> 工作日</span>
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-400"></span> 周末休息</span>
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-500"></span> 特殊/连通休假</span>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full border-collapse">
                            <thead>
                                <tr>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周一</th>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周二</th>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周三</th>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周四</th>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周五</th>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周六</th>
                                    <th class="px-2 py-2 text-xs font-medium text-gray-700 border border-gray-200 bg-gray-50">周日</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(() => {
                                    // Monday-first weekday index
                                    const weekdayIdx = (d) => (d.getDay() + 6) % 7;
                                    const specialSet = new Set(
                                        fullDateList
                                            .filter(d => d.lunarHoliday || d.fixedHoliday || (d.holidayName && d.holidayName !== ''))
                                            .map(d => d.dateStr)
                                    );

                                    // 预计算连通性：休息日与特殊假日连续（任意长度）则视为连通（包含延伸日期）
                                    const restFlags = fullDateList.map((info) => {
                                        const dateStr = info.dateStr;
                                        const isWeekend = info.isWeekend;
                                        const hasOverride = Object.prototype.hasOwnProperty.call(restDays, dateStr);
                                        return hasOverride ? restDays[dateStr] === true : isWeekend;
                                    });
                                    const specialFlags = fullDateList.map(info => specialSet.has(info.dateStr));
                                    const connectedToSpecial = new Array(fullDateList.length).fill(false);
                                    // 标记特殊自身
                                    specialFlags.forEach((v, idx) => { if (v) connectedToSpecial[idx] = true; });
                                    // 左到右传播
                                    for (let i = 1; i < fullDateList.length; i++) {
                                        if (restFlags[i] && (connectedToSpecial[i - 1] || specialFlags[i - 1])) {
                                            connectedToSpecial[i] = true;
                                        }
                                    }
                                    // 右到左传播
                                    for (let i = fullDateList.length - 2; i >= 0; i--) {
                                        if (restFlags[i] && (connectedToSpecial[i + 1] || specialFlags[i + 1])) {
                                            connectedToSpecial[i] = true;
                                        }
                                    }

                                    // Build weeks
                                    const weeks = [];
                                    let currentWeek = new Array(7).fill(null);
                                    fullDateList.forEach((info, idx) => {
                                        const w = weekdayIdx(info.date);
                                        currentWeek[w] = { ...info, idx };
                                        if (w === 6) {
                                            weeks.push(currentWeek);
                                            currentWeek = new Array(7).fill(null);
                                        }
                                    });
                                    if (currentWeek.some(Boolean)) {
                                        weeks.push(currentWeek);
                                    }

                                    const cells = (cell) => {
                                        if (!cell) {
                                            return `<td class="h-20 border border-gray-200 bg-white"></td>`;
                                        }
                                        const dateStr = cell.dateStr;
                                        const isWeekend = cell.isWeekend;
                                        const isSpecial = cell.lunarHoliday || cell.fixedHoliday || (cell.holidayName && cell.holidayName !== '');
                                        const isInPeriod = cell.isInPeriod === true;
                                        
                                        // 计算默认休息日状态：
                                        // 1. 周末默认休息
                                        // 2. 法定节假日当天默认休息（元旦、清明、五一、端午、中秋）
                                        // 3. 春节第一天及之后2天（共3天）默认休息
                                        // 4. 国庆（10月1日）及之后2天（共3天）默认休息
                                        const hasExplicitOverride = Object.prototype.hasOwnProperty.call(restDays, dateStr);
                                        
                                        // 获取节假日名称
                                        const holidayName = cell.holidayName || cell.lunarHoliday || '';
                                        const isDefaultHolidayRest = (() => {
                                            // 法定节假日当天默认休息
                                            if (holidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
                                                return true;
                                            }
                                            // 春节第一天及之后2天默认休息
                                            if (holidayName === '春节') {
                                                return true;
                                            }
                                            // 国庆（10月1日）及之后2天默认休息
                                            if (holidayName === '国庆') {
                                                const date = new Date(dateStr);
                                                const month = date.getMonth() + 1;
                                                const day = date.getDate();
                                                if (month === 10 && day >= 1 && day <= 3) {
                                                    return true;
                                                }
                                            }
                                            return false;
                                        })();
                                        
                                        // 计算当前是否应该是休息日
                                        // 优先级：显式覆盖（false） > 默认节假日休息 > 周末默认休息
                                        // 注意：法定节假日默认显示为红色（休息日），除非用户明确设置为false（工作日）
                                        // 如果restDays中有这个日期：
                                        //   - 值为true：显示为休息日（红色）
                                        //   - 值为false：显示为工作日（灰色）
                                        // 如果restDays中没有这个日期：
                                        //   - 法定节假日默认休息（红色）
                                        //   - 周末默认休息（蓝色）
                                        const isRestDay = hasExplicitOverride 
                                            ? restDays[dateStr] === true  // 如果显式标记，使用标记值（true=休息日，false=工作日）
                                            : (isDefaultHolidayRest || isWeekend);  // 如果没有显式标记，使用默认值（法定节假日默认休息，周末默认休息）

                                        let bg = 'bg-gray-50';
                                        let text = 'text-gray-800';
                                        let borderClass = isInPeriod ? 'ring-2 ring-blue-400 ring-inset' : 'opacity-60';

                                        const isConnected = connectedToSpecial[cell.idx];

                                        // 颜色渲染逻辑：
                                        // 1. 特殊节假日 + 休息日 -> 红色（bg-red-500）
                                        // 2. 特殊节假日 + 工作日 -> 灰色（bg-gray-50），但显示节假日名称
                                        // 3. 与特殊节假日连通的休息日 -> 红色（bg-red-500）
                                        // 4. 普通休息日（未连通特殊假日）-> 蓝色（bg-blue-400）
                                        // 5. 普通工作日 -> 灰色（bg-gray-50）
                                        if (isSpecial && isRestDay) {
                                            // 特殊节假日且是休息日 -> 红色
                                            bg = 'bg-red-500';
                                            text = 'text-white';
                                        } else if (isRestDay && isConnected) {
                                            // 与特殊节假日连通的休息日 -> 红色
                                            bg = 'bg-red-500';
                                            text = 'text-white';
                                        } else if (isRestDay) {
                                            // 休息日（周末或工作日被标记为休息）未连通特殊假日 -> 蓝色
                                            bg = 'bg-blue-400';
                                            text = 'text-white';
                                        } else {
                                            // 工作日（包含特殊节假日被设为工作日、周末被设为工作日、普通工作日）
                                            bg = 'bg-gray-50';
                                            text = 'text-gray-800';
                                        }

                                        const title = isSpecial
                                            ? `${cell.holidayName || cell.lunarHoliday || '特殊假日'}${isInPeriod ? '' : '（延伸日期，不计入排班周期）'}，点击切换工作日/休息日`
                                            : isRestDay 
                                                ? `休息日${isInPeriod ? '' : '（延伸日期，不计入排班周期）'}，点击切换为工作日` 
                                                : `工作日${isInPeriod ? '' : '（延伸日期，不计入排班周期）'}，点击切换为休息日`;

                                        // 延伸日期也可以点击切换，但视觉上有区别
                                        const extensionStyle = isInPeriod ? '' : 'opacity-60 border-2 border-dashed border-gray-400';
                                        const extensionBg = isInPeriod ? '' : 'bg-opacity-70';

                                        return `
                                            <td class="h-24 border border-gray-200 p-2">
                                                <div class="rounded-lg h-full px-2 py-3 transition-colors ${bg} ${text} ${borderClass} ${extensionStyle} ${extensionBg} cursor-pointer"
                                                     data-date="${dateStr}"
                                                     data-rest-day-cell="true"
                                                     data-in-period="${isInPeriod}"
                                                     title="${title}"
                                                     onclick="SchedulePeriodManager.toggleRestDay('${dateStr}'); return false;"
                                                     style="pointer-events: auto; user-select: none;">
                                                    <div class="text-sm font-semibold" style="pointer-events: none;">${dateStr}</div>
                                                    ${isSpecial ? `<div class="text-[11px] font-medium ${text} opacity-90 mt-1" style="pointer-events: none;">${cell.holidayName || cell.lunarHoliday || '节假日'}</div>` : ''}
                                                </div>
                                            </td>
                                        `;
                                    };

                                    return weeks.map(week => `<tr>${week.map(cells).join('')}</tr>`).join('');
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        scheduleTable.innerHTML = html;
        
        // 绑定年月变更事件
        const yearInput = document.getElementById('periodYear');
        const monthInput = document.getElementById('periodMonth');
        const startDateInput = document.getElementById('periodStartDate');
        const endDateInput = document.getElementById('periodEndDate');
        
        if (yearInput && monthInput) {
            const handleChange = () => {
                const year = parseInt(yearInput.value);
                const month = parseInt(monthInput.value);
                if (year && month) {
                    const { startDate, endDate } = typeof DateCalculator !== 'undefined'
                        ? DateCalculator.calculateSchedulePeriod(year, month)
                        : (() => {
                            const start = new Date(year, month - 2, 26);
                            const end = new Date(year, month - 1, 25);
                            const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
                            return {
                                startDate: formatFn(start),
                                endDate: formatFn(end)
                            };
                        })();
                    
                    if (startDateInput) startDateInput.value = startDate;
                    if (endDateInput) endDateInput.value = endDate;
                }
            };
            
            yearInput.addEventListener('change', handleChange);
            monthInput.addEventListener('change', handleChange);
        }
    },
    
    /**
     * 切换休息日状态
     */
    async toggleRestDay(dateStr) {
        // 所有日期都可以切换，包括特殊节假日（春节、十一、中秋等）
        const restMap = Store.getAllRestDays();
        const hasOverride = Object.prototype.hasOwnProperty.call(restMap, dateStr);
        const isWeekend = (() => {
            const d = new Date(dateStr).getDay();
            return d === 0 || d === 6;
        })();
        
        // 获取节假日名称
        const getHolidayNameFn = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
            ? HolidayManager.getHolidayName.bind(HolidayManager)
            : (dateStr) => {
                const year = new Date(dateStr).getFullYear();
                const holidays = typeof HolidayManager !== 'undefined' ? HolidayManager.getHolidays(year) : {};
                return holidays[dateStr] || '';
            };
        const holidayName = getHolidayNameFn(dateStr);
        
        // 计算默认休息日状态
        const isDefaultHolidayRest = (() => {
            // 法定节假日当天默认休息
            if (holidayName && ['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
                return true;
            }
            // 春节第一天及之后2天默认休息
            if (holidayName === '春节') {
                return true;
            }
            // 国庆（10月1日）及之后2天默认休息
            if (holidayName === '国庆') {
                const date = new Date(dateStr);
                const month = date.getMonth() + 1;
                const day = date.getDate();
                if (month === 10 && day >= 1 && day <= 3) {
                    return true;
                }
            }
            return false;
        })();
        
        // 计算当前有效状态（考虑周末默认休息和法定节假日默认休息）
        // 优先级：显式覆盖 > 默认节假日休息 > 周末默认休息
        const currentEffectiveRest = hasOverride 
            ? restMap[dateStr] === true 
            : (isDefaultHolidayRest || isWeekend);
        
        // 切换状态
        const newRest = !currentEffectiveRest;
        
        // 设置新的状态
        if (newRest) {
            // 设置为休息日（无论是周末、工作日还是特殊节假日）
            Store.state.restDays[dateStr] = true;
        } else {
            // 设置为工作日
            // 对于周末或法定节假日（默认休息），需要显式设置为false（覆盖默认的休息状态）
            // 对于普通工作日，删除覆盖或显式设置为false
            if (isWeekend || isDefaultHolidayRest) {
                // 周末或法定节假日显式设为工作日（覆盖默认的休息状态）
                Store.state.restDays[dateStr] = false;
            } else {
                // 普通工作日设为工作日
                // 如果有覆盖，删除覆盖（恢复默认状态）
                // 如果没有覆盖，显式设置为false（确保是工作日）
                if (hasOverride) {
                    // 删除覆盖，恢复默认状态（工作日默认不休息）
                    delete Store.state.restDays[dateStr];
                } else {
                    // 显式设置为false，确保是工作日
                    Store.state.restDays[dateStr] = false;
                }
            }
        }

        // 重新渲染月历（无持久化）
        if (this.currentConfigId) {
            const config = Store.getSchedulePeriodConfig(this.currentConfigId);
            if (config) {
                await this.renderPeriodDetail(config);
            }
        }
    },
    
    /**
     * 配置校验并保存
     */
    async validateAndSave() {
        try {
            if (!this.currentConfigId) {
                alert('请先创建或选择一个配置');
                return;
            }
            
            const yearInput = document.getElementById('periodYear');
            const monthInput = document.getElementById('periodMonth');
            const startDateInput = document.getElementById('periodStartDate');
            const endDateInput = document.getElementById('periodEndDate');
            
            if (!yearInput || !monthInput || !startDateInput || !endDateInput) {
                alert('排班周期配置控件未找到');
                return;
            }
            
            const year = parseInt(yearInput.value);
            const month = parseInt(monthInput.value);
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            
            if (!year || !month || !startDate || !endDate) {
                alert('请填写完整的排班周期信息');
                return;
            }
            
            // 验证日期范围
            if (new Date(startDate) > new Date(endDate)) {
                alert('开始日期不能晚于结束日期');
                return;
            }
            
            // 检查重复性（当前月份的排班周期必须唯一）
            const existingConfigs = Store.getSchedulePeriodConfigs() || [];
            const yearMonth = `${year}${String(month).padStart(2, '0')}`;
            const existing = existingConfigs.find(c => {
                if (c.configId === this.currentConfigId) return false; // 排除当前配置
                const configYearMonth = c.scheduleConfig 
                    ? `${c.scheduleConfig.year}${String(c.scheduleConfig.month).padStart(2, '0')}`
                    : null;
                return configYearMonth === yearMonth;
            });
            
            if (existing) {
                alert(`该月份（${yearMonth}）的排班周期配置已存在：${existing.name}，请先删除或编辑现有配置`);
                return;
            }
            
            // 检查开始和结束日期的唯一性
            const duplicate = existingConfigs.find(c => {
                if (c.configId === this.currentConfigId) return false;
                return c.scheduleConfig && 
                       c.scheduleConfig.startDate === startDate && 
                       c.scheduleConfig.endDate === endDate;
            });
            
            if (duplicate) {
                alert(`该排班周期（${startDate} 至 ${endDate}）已存在于配置：${duplicate.name}`);
                return;
            }
            
            // 更新配置
            const restDays = Store.getAllRestDays();
            Store.updateSchedulePeriodConfig(this.currentConfigId, {
                scheduleConfig: {
                    startDate,
                    endDate,
                    year,
                    month
                },
                restDaysSnapshot: JSON.parse(JSON.stringify(restDays)),
                schedulePeriod: `${startDate} 至 ${endDate}`
            });
            
            // 更新Store中的排班周期
            Store.updateState({
                scheduleConfig: {
                    startDate,
                    endDate,
                    year,
                    month
                }
            });
            
            // 保存到IndexedDB
            await this.saveToIndexedDB();
            
            // 联动更新：如果当前配置是激活的排班周期配置，自动更新对应月份的个性化需求配置的restDaysSnapshot
            const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
            if (activeSchedulePeriodConfigId === this.currentConfigId) {
                await this.syncPersonalRequestConfigs(restDays, year, month);
            }
            
            // 重新渲染
            const config = Store.getSchedulePeriodConfig(this.currentConfigId);
            if (config) {
                await this.renderPeriodDetail(config);
            }
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已保存', 'success');
        } catch (error) {
            console.error('validateAndSave 失败:', error);
            alert('保存失败：' + error.message);
        }
    },

    /**
     * 保存当前配置（按钮）
     */
    async saveCurrentConfig() {
        if (!this.currentConfigId) {
            alert('请先创建或选择一个配置');
            return;
        }
        const config = Store.getSchedulePeriodConfig(this.currentConfigId);
        if (!config || !config.scheduleConfig) {
            alert('配置无排班周期数据，无法保存');
            return;
        }
        
        // 校验法定节假日是否已正确标记为休息日（与渲染逻辑保持一致）
        const validationErrors = [];
        const restDays = Store.getAllRestDays();
        const scheduleConfig = config.scheduleConfig;
        
        // 生成实际排班周期的日期列表（包含延伸用于连通性判断）
        const startDate = new Date(scheduleConfig.startDate);
        const endDate = new Date(scheduleConfig.endDate);
        const extendedStartDate = new Date(startDate);
        extendedStartDate.setDate(extendedStartDate.getDate() - 7);
        const extendedEndDate = new Date(endDate);
        extendedEndDate.setDate(extendedEndDate.getDate() + 7);
        
        const fullDateList = this.generateDateList(
            extendedStartDate.toISOString().split('T')[0],
            extendedEndDate.toISOString().split('T')[0]
        );
        const actualDateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const actualDateSet = new Set(actualDateList.map(d => d.dateStr));
        
        // 构建特殊假日集合和连通性判断（与渲染逻辑一致）
        const specialSet = new Set(
            fullDateList
                .filter(d => d.lunarHoliday || d.fixedHoliday || (d.holidayName && d.holidayName !== ''))
                .map(d => d.dateStr)
        );
        
        const restFlags = fullDateList.map((info) => {
            const dateStr = info.dateStr;
            const isWeekend = info.isWeekend;
            const hasOverride = Object.prototype.hasOwnProperty.call(restDays, dateStr);
            return hasOverride ? restDays[dateStr] === true : isWeekend;
        });
        const specialFlags = fullDateList.map(info => specialSet.has(info.dateStr));
        const connectedToSpecial = new Array(fullDateList.length).fill(false);
        specialFlags.forEach((v, idx) => { if (v) connectedToSpecial[idx] = true; });
        for (let i = 1; i < fullDateList.length; i++) {
            if (restFlags[i] && (connectedToSpecial[i - 1] || specialFlags[i - 1])) {
                connectedToSpecial[i] = true;
            }
        }
        for (let i = fullDateList.length - 2; i >= 0; i--) {
            if (restFlags[i] && (connectedToSpecial[i + 1] || specialFlags[i + 1])) {
                connectedToSpecial[i] = true;
            }
        }
        
        // 检测特殊节假日（仅限实际周期内）
        const specialHolidays = [];
        actualDateList.forEach((dateInfo, idx) => {
            const holidayName = dateInfo.holidayName || dateInfo.lunarHoliday || '';
            if (holidayName) {
                // 找到在完整列表中的索引
                const fullIdx = fullDateList.findIndex(d => d.dateStr === dateInfo.dateStr);
                specialHolidays.push({
                    dateStr: dateInfo.dateStr,
                    holidayName: holidayName,
                    fullIdx: fullIdx
                });
            }
        });
        
        // 校验每个法定节假日是否已标记为休息日（考虑连通性）
        specialHolidays.forEach(holiday => {
            const hasExplicitOverride = Object.prototype.hasOwnProperty.call(restDays, holiday.dateStr);
            const isWeekend = (() => {
                const d = new Date(holiday.dateStr).getDay();
                return d === 0 || d === 6;
            })();
            const isRestDay = hasExplicitOverride ? restDays[holiday.dateStr] === true : isWeekend;
            const isConnected = holiday.fullIdx >= 0 && connectedToSpecial[holiday.fullIdx];
            
            // 特殊假日本身，或与特殊假日连通且为休息日，都视为已正确标记
            if (!isRestDay && !isConnected) {
                validationErrors.push(`${holiday.holidayName}（${holiday.dateStr}）未标记为休息日`);
            }
        });
        
        // 校验春节：春节第一天及其后两天（共3天）必须为休息日或连通
        const springFestivalDates = specialHolidays.filter(h => h.holidayName === '春节').map(h => h.dateStr).sort();
        if (springFestivalDates.length > 0) {
            const firstDay = springFestivalDates[0];
            const firstDate = new Date(firstDay);
            for (let i = 0; i < 3; i++) {
                const checkDate = new Date(firstDate);
                checkDate.setDate(checkDate.getDate() + i);
                const checkDateStr = checkDate.toISOString().split('T')[0];
                
                const isInPeriod = actualDateSet.has(checkDateStr);
                if (isInPeriod) {
                    const fullIdx = fullDateList.findIndex(d => d.dateStr === checkDateStr);
                    const hasExplicitOverride = Object.prototype.hasOwnProperty.call(restDays, checkDateStr);
                    const isWeekend = (() => {
                        const d = new Date(checkDateStr).getDay();
                        return d === 0 || d === 6;
                    })();
                    const isRestDay = hasExplicitOverride ? restDays[checkDateStr] === true : isWeekend;
                    const isConnected = fullIdx >= 0 && connectedToSpecial[fullIdx];
                    
                    if (!isRestDay && !isConnected) {
                        validationErrors.push(`春节假期第${i + 1}天（${checkDateStr}）未标记为休息日`);
                    }
                }
            }
        }
        
        // 校验国庆：10月1日及其后两天（共3天）必须为休息日或连通
        const nationalDayDates = specialHolidays.filter(h => h.holidayName === '国庆').map(h => h.dateStr).sort();
        if (nationalDayDates.length > 0) {
            const firstDay = nationalDayDates[0];
            const firstDate = new Date(firstDay);
            for (let i = 0; i < 3; i++) {
                const checkDate = new Date(firstDate);
                checkDate.setDate(checkDate.getDate() + i);
                const checkDateStr = checkDate.toISOString().split('T')[0];
                
                const isInPeriod = actualDateSet.has(checkDateStr);
                if (isInPeriod) {
                    const fullIdx = fullDateList.findIndex(d => d.dateStr === checkDateStr);
                    const hasExplicitOverride = Object.prototype.hasOwnProperty.call(restDays, checkDateStr);
                    const isWeekend = (() => {
                        const d = new Date(checkDateStr).getDay();
                        return d === 0 || d === 6;
                    })();
                    const isRestDay = hasExplicitOverride ? restDays[checkDateStr] === true : isWeekend;
                    const isConnected = fullIdx >= 0 && connectedToSpecial[fullIdx];
                    
                    if (!isRestDay && !isConnected) {
                        validationErrors.push(`国庆假期第${i + 1}天（${checkDateStr}）未标记为休息日`);
                    }
                }
            }
        }
        
        // 如果有校验错误，弹窗提醒并提供强制保存选项
        if (validationErrors.length > 0) {
            const errorMsg = '提醒：以下法定节假日未正确标记为休息日：\n\n' + validationErrors.join('\n') + '\n\n是否仍要强制保存？';
            const shouldForceSave = confirm(errorMsg);
            if (!shouldForceSave) {
                return; // 取消则返回当前页面
            }
        }

        Store.updateSchedulePeriodConfig(this.currentConfigId, {
            restDaysSnapshot: JSON.parse(JSON.stringify(restDays)),
            schedulePeriod: `${config.scheduleConfig.startDate} 至 ${config.scheduleConfig.endDate}`
        }, false);

        // 保存并激活
        await Store.setActiveSchedulePeriodConfig(this.currentConfigId);
        await Store.saveState(false);
        
        // 联动更新：自动更新对应月份的个性化需求配置的restDaysSnapshot
        if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
            await this.syncPersonalRequestConfigs(restDays, config.scheduleConfig.year, config.scheduleConfig.month);
        }

        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('当前配置已保存并激活', 'success');
        
        // 立即返回配置列表
        await this.backToConfigList();
    },

    /**
     * 重置当前配置到初始创建状态
     * 恢复到配置刚创建时的状态：清空所有显式设置的休息日覆盖
     * 周末会默认显示为休息（蓝色），工作日显示为工作（灰色）
     */
    async resetCurrentConfig() {
        if (!this.currentConfigId) return;
        
        // 恢复到初始创建状态：完全清空所有显式设置的休息日覆盖
        // 这样周末会自动显示为休息（因为周末默认休息的逻辑），工作日显示为工作
        Store.state.restDays = {};
        
        // 恢复排班周期配置（保持配置的排班周期不变）
        const config = Store.getSchedulePeriodConfig(this.currentConfigId);
        if (config && config.scheduleConfig) {
            Store.updateState({
                scheduleConfig: JSON.parse(JSON.stringify(config.scheduleConfig))
            }, false);
        }
        
        // 立即重新渲染
        if (config) {
            await this.renderPeriodDetail(config);
        }
        
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('已重置到初始创建状态（未保存）', 'info');
    },
    
    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            await Store.setActiveSchedulePeriodConfig(configId);
            await this.saveToIndexedDB();
            await this.showSchedulePeriodManagement();
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已激活', 'success');
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },
    
    /**
     * 删除配置
     */
    async deleteConfig(configId) {
        if (!confirm('确定要删除该配置吗？')) {
            return;
        }
        
        try {
            const wasActive = Store.getState('activeSchedulePeriodConfigId') === configId;

            Store.deleteSchedulePeriodConfig(configId);
            if (typeof DB !== 'undefined' && DB.deleteSchedulePeriodConfig) {
                await DB.deleteSchedulePeriodConfig(configId);
            }
            // 如果删掉的是激活配置，且还有其他配置，则激活第一个
            const remaining = Store.getSchedulePeriodConfigs();
            if (wasActive && remaining && remaining.length > 0) {
                await Store.setActiveSchedulePeriodConfig(remaining[0].configId);
            }

            await this.saveToIndexedDB();
            await this.showSchedulePeriodManagement();
            
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置已删除', 'success');
        } catch (error) {
            alert('删除失败：' + error.message);
        }
    },
    
    /**
     * 返回配置列表
     * 若原本未激活该配置，则保持原激活状态；若原本激活或新建，保持当前激活。
     */
    async backToConfigList() {
        // 恢复激活状态（如果进入时未激活当前配置）
        if (this.wasActiveCurrent === false && this.prevActiveSchedulePeriodId && this.prevActiveSchedulePeriodId !== this.currentConfigId) {
            await Store.setActiveSchedulePeriodConfig(this.prevActiveSchedulePeriodId);
        }
        // 如果原来是激活或新建，保持当前配置激活（已在 saveCurrentConfig 中处理）
        
        this.currentView = 'configs';
        this.currentConfigId = null;
        this.wasActiveCurrent = null;
        this.prevActiveSchedulePeriodId = null;
        
        Store.updateState({
            currentView: 'schedulePeriod',
            currentSubView: 'configs',
            currentConfigId: null
        });
        
        await this.showSchedulePeriodManagement();
    },
    
    /**
     * 联动更新个性化需求配置的restDaysSnapshot
     * 当排班周期配置的restDaysSnapshot更新时，自动更新对应月份的个性化需求配置
     */
    async syncPersonalRequestConfigs(restDaysSnapshot, year, month) {
        try {
            const yearMonth = `${year}${String(month).padStart(2, '0')}`;
            const requestConfigs = Store.getRequestConfigs() || [];
            
            // 找到所有对应月份的个性化需求配置
            const matchingConfigs = requestConfigs.filter(config => {
                if (config.scheduleConfig && config.scheduleConfig.year && config.scheduleConfig.month) {
                    const configYearMonth = `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}`;
                    return configYearMonth === yearMonth;
                }
                return false;
            });
            
            if (matchingConfigs.length === 0) {
                console.log(`syncPersonalRequestConfigs: 未找到${yearMonth}月份的个性化需求配置，跳过联动更新`);
                return;
            }
            
            // 更新所有匹配的配置的restDaysSnapshot
            for (const config of matchingConfigs) {
                Store.updateRequestConfig(config.configId, {
                    restDaysSnapshot: JSON.parse(JSON.stringify(restDaysSnapshot))
                }, false);
                console.log(`syncPersonalRequestConfigs: 已更新配置 ${config.name} 的restDaysSnapshot`);
            }
            
            // 保存到IndexedDB
            if (typeof RequestManager !== 'undefined' && RequestManager.saveToIndexedDB) {
                await RequestManager.saveToIndexedDB();
            } else if (typeof DB !== 'undefined' && DB.db) {
                // 保存所有更新的配置
                for (const config of matchingConfigs) {
                    const updatedConfig = Store.getRequestConfig(config.configId);
                    if (updatedConfig) {
                        await DB.saveRequestConfig(updatedConfig);
                    }
                }
            }
            
            console.log(`syncPersonalRequestConfigs: 已联动更新${matchingConfigs.length}个个性化需求配置`);
        } catch (error) {
            console.error('syncPersonalRequestConfigs 失败:', error);
            // 不抛出错误，避免影响排班周期配置的保存
        }
    },
    
    /**
     * 保存到IndexedDB
     */
    async saveToIndexedDB() {
        if (typeof Store !== 'undefined' && Store.saveState) {
            await Store.saveState();
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.SchedulePeriodManager = SchedulePeriodManager;
}

