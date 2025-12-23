/**
 * Excel 数据加载与处理模块
 * 负责处理人员数据的上传、解析和积分计算
 */

const DataLoader = {
    // 存储上次上传的错误信息
    lastUploadErrors: null,
    /**
     * 处理文件上传（支持Excel和CSV）
     * @param {File} file - 上传的文件对象
     * @returns {Promise<Array>} 解析后的人员数据数组
     */
    async loadExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const fileName = file.name.toLowerCase();
            const isCSV = fileName.endsWith('.csv');
            
            reader.onload = (e) => {
                try {
                    let jsonData;
                    
                    if (isCSV) {
                        // 处理CSV文件
                        const text = e.target.result;
                        const lines = text.split('\n').filter(line => line.trim());
                        jsonData = lines.map(line => {
                            // 简单的CSV解析（支持逗号和分号分隔）
                            return line.split(/[,;]/).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
                        });
                    } else {
                        // 处理Excel文件
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        
                        // 读取第一个工作表
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        
                        // 转换为 JSON 格式
                        jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                            header: 1,
                            defval: '' // 空单元格默认值
                        });
                    }
                    
                    // 解析数据
                    const parsedData = this.parseStaffData(jsonData);
                    resolve(parsedData);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            // CSV使用文本读取，Excel使用二进制读取
            if (isCSV) {
                reader.readAsText(file, 'UTF-8');
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    },

    /**
     * 解析人员数据
     * @param {Array<Array>} rawData - Excel 原始数据（二维数组）
     * @returns {Array<Object>} 解析后的人员数据
     */
    parseStaffData(rawData) {
        if (!rawData || rawData.length < 2) {
            throw new Error('Excel 文件格式不正确：至少需要表头和一行数据');
        }

        // 第一行作为表头
        const headers = rawData[0].map(h => String(h).trim());
        
        // 查找列索引（支持多种可能的列名）
        const columnMap = this.findColumnIndices(headers);
        
        // 验证必需的列是否存在
        const requiredColumns = ['id', 'name'];
        const missingColumns = requiredColumns.filter(col => columnMap[col] === -1);
        if (missingColumns.length > 0) {
            throw new Error(`缺少必需的列：${missingColumns.join(', ')}`);
        }

        // 解析数据行
        const staffList = [];
        const errors = []; // 收集错误信息
        
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            
            // 跳过空行
            if (row.every(cell => !cell || String(cell).trim() === '')) {
                continue;
            }

            try {
                const result = this.parseStaffRow(row, columnMap, i + 1);
                if (result) {
                    if (result.error) {
                        // 有错误但数据仍然有效
                        errors.push({
                            row: i + 1,
                            staffId: (result.staff && result.staff.id) || '未知',
                            errors: result.error
                        });
                        if (result.staff) {
                            staffList.push(result.staff);
                        }
                    } else {
                        staffList.push(result);
                    }
                }
            } catch (error) {
                console.warn(`第 ${i + 1} 行解析失败:`, error.message);
                errors.push({
                    row: i + 1,
                    staffId: '未知',
                    errors: [error.message]
                });
            }
        }

        // 如果有错误，存储错误信息
        if (errors.length > 0) {
            this.lastUploadErrors = errors;
        } else {
            this.lastUploadErrors = null;
        }

        return staffList;
    },

    /**
     * 查找列索引（支持多种列名变体）
     * @param {Array<string>} headers - 表头数组
     * @returns {Object} 列名到索引的映射
     */
    findColumnIndices(headers) {
        const map = {
            id: -1,
            name: -1,
            canNightShift: -1,  // 大夜是否可排（是/否）
            gender: -1,
            skills: -1,
            lastMonthNightShiftDays: -1,  // 上个月的大夜天数
            menstrualPeriod: -1,
            // 人员类型和归属地
            personType: -1,      // 人员类型
            location: -1,        // 归属地
            // 积分计算相关
            lastYearSpringFestival: -1,  // 上年春节上班天数
            lastYearNationalDay: -1,      // 上年国庆上班天数
            currentYearHolidays: -1       // 当年节假上班天数
        };

        headers.forEach((header, index) => {
            const headerLower = String(header).toLowerCase().trim();
            
            // ID 列
            if (headerLower.includes('id') || headerLower.includes('人员id') || headerLower.includes('编号')) {
                map.id = index;
            }
            // 姓名列
            else if (headerLower.includes('姓名') || headerLower.includes('name') || headerLower === 'name') {
                map.name = index;
            }
            // 大夜是否可排列
            else if (headerLower.includes('大夜是否可排') || headerLower.includes('大夜可排') ||
                     headerLower.includes('canNightShift') || headerLower.includes('不排大夜')) {
                map.canNightShift = index;
            }
            // 性别列
            else if (headerLower.includes('性别') || headerLower.includes('gender') || headerLower === 'gender') {
                map.gender = index;
            }
            // 技能列（可能是多个列，或单个列用分隔符分隔）
            else if (headerLower.includes('技能') || headerLower.includes('skill')) {
                // 如果已经有技能列，检查是否是多个技能列
                if (map.skills === -1) {
                    map.skills = index;
                }
            }
            // 上个月的大夜天数
            else if (headerLower.includes('上个月') || headerLower.includes('上月') || 
                     headerLower.includes('大夜天数') || headerLower.includes('历史上班') || 
                     headerLower.includes('history') || headerLower.includes('lastMonthNightShift')) {
                map.lastMonthNightShiftDays = index;
            }
            // 上下半月偏好（原生理期）
            else if (headerLower.includes('生理期') || headerLower.includes('上下半月') || headerLower.includes('半月偏好') || 
                     headerLower.includes('menstrual') || headerLower.includes('生理')) {
                map.menstrualPeriod = index;
            }
            // 人员类型
            else if (headerLower.includes('人员类型') || headerLower.includes('类型') || headerLower.includes('personType') || 
                     headerLower.includes('全人力') || headerLower.includes('半人力') || headerLower.includes('授权')) {
                map.personType = index;
            }
            // 归属地
            else if (headerLower.includes('归属地') || headerLower.includes('地点') || headerLower.includes('location') || 
                     headerLower.includes('城市') || headerLower === '上海' || headerLower === '成都') {
                map.location = index;
            }
            // 上年春节
            else if (headerLower.includes('上年春节') || headerLower.includes('去年春节')) {
                map.lastYearSpringFestival = index;
            }
            // 上年国庆
            else if (headerLower.includes('上年国庆') || headerLower.includes('去年国庆')) {
                map.lastYearNationalDay = index;
            }
            // 当年节假（可能是多个列，需要合并计算）
            else if (headerLower.includes('当年') && (headerLower.includes('节假') || headerLower.includes('元旦') || 
                     headerLower.includes('清明') || headerLower.includes('五一') || 
                     headerLower.includes('端午') || headerLower.includes('中秋'))) {
                // 如果已经有当年节假列，可能需要累加
                if (map.currentYearHolidays === -1) {
                    map.currentYearHolidays = index;
                }
            }
        });

        // 处理技能列：可能是"固定技能-网"、"固定技能-天"、"固定技能-微"等多个列
        // 支持的技能：网、天、微、银B、追、毛
        const skillColumns = [];
        headers.forEach((header, index) => {
            const headerLower = String(header).toLowerCase().trim();
            if (headerLower.includes('固定技能') || headerLower.includes('技能')) {
                if (headerLower.includes('网') || headerLower.includes('net')) {
                    skillColumns.push({ index, type: '网' });
                } else if (headerLower.includes('天') || headerLower.includes('day')) {
                    skillColumns.push({ index, type: '天' });
                } else if (headerLower.includes('微') || headerLower.includes('micro')) {
                    skillColumns.push({ index, type: '微' });
                } else if (headerLower.includes('银b') || headerLower.includes('银B') || headerLower.includes('银b')) {
                    skillColumns.push({ index, type: '银B' });
                } else if (headerLower.includes('追')) {
                    skillColumns.push({ index, type: '追' });
                } else if (headerLower.includes('毛')) {
                    skillColumns.push({ index, type: '毛' });
                }
            }
        });
        
        // 如果有多个技能列，存储它们
        if (skillColumns.length > 0) {
            map.skillColumns = skillColumns;
        }

        return map;
    },

    /**
     * 解析单行人员数据
     * @param {Array} row - 数据行
     * @param {Object} columnMap - 列索引映射
     * @param {number} rowNumber - 行号（用于错误提示）
     * @returns {Object} 解析后的人员对象
     */
    parseStaffRow(row, columnMap, rowNumber) {
        // 获取基本字段
        const id = this.getCellValue(row, columnMap.id);
        const name = this.getCellValue(row, columnMap.name);
        
        if (!id && !name) {
            return null; // 跳过空行
        }

        const errors = []; // 收集本行的错误

        // 解析技能（可能是单个列用分隔符分隔，或多个列）
        let skills = [];
        if (columnMap.skillColumns && columnMap.skillColumns.length > 0) {
            // 多个技能列的情况
            columnMap.skillColumns.forEach(({ index, type }) => {
                const value = this.getCellValue(row, index);
                if (value && (value === '是' || value === 'Y' || value === 'y' || value === true || value === 1 || value === '1')) {
                    skills.push(type);
                }
            });
        } else if (columnMap.skills !== -1) {
            // 单个技能列，需要拆分
            const skillsValue = this.getCellValue(row, columnMap.skills);
            if (skillsValue) {
                skills = String(skillsValue).split(/[，,、|]/).map(s => s.trim()).filter(s => s);
            }
        }

        // 如果没有技能，设置默认值为所有技能
        if (skills.length === 0) {
            skills = ['网', '天', '微', '银B', '追', '毛']; // 默认所有技能
        }
        
        // 验证技能值（只允许：网、天、微、银B、追、毛）
        const validSkills = ['网', '天', '微', '银B', '追', '毛'];
        skills = skills.filter(skill => validSkills.includes(skill));
        if (skills.length === 0) {
            skills = ['网', '天', '微', '银B', '追', '毛']; // 如果过滤后为空，设置默认值为所有技能
        }

        // 解析其他字段
        const gender = this.getCellValue(row, columnMap.gender) || '未知';
        
        // 大夜是否可排（留空或"是"都表示可排，只有"否"才不可排）
        let canNightShift = this.getCellValue(row, columnMap.canNightShift) || '';
        canNightShift = String(canNightShift).trim();
        // 标准化：只有明确为"否"才是不可排，其他都默认可排
        if (canNightShift && (canNightShift === '否' || canNightShift.toLowerCase() === 'no' || canNightShift.toLowerCase() === 'n')) {
            canNightShift = '否';
        } else {
            canNightShift = '是'; // 默认可排（留空或"是"都表示可排）
        }
        
        const lastMonthNightShiftDays = this.parseNumber(this.getCellValue(row, columnMap.lastMonthNightShiftDays)) || 0;
        
        // 上下半月偏好（仅女性可填写，默认空）
        let menstrualPeriod = this.getCellValue(row, columnMap.menstrualPeriod) || '';
        menstrualPeriod = String(menstrualPeriod).trim();
        // 只有女性才能有上下半月偏好，非女性清空
        if (gender !== '女' && menstrualPeriod) {
            errors.push('非女性人员不应填写上下半月偏好');
            menstrualPeriod = ''; // 非女性清空
        }
        // 标准化为"上"或"下"，其他值清空（女性可以不填写，留空表示无偏好）
        if (menstrualPeriod && gender === '女') {
            if (menstrualPeriod === '上' || menstrualPeriod === '下') {
                // 保持原值
            } else {
                menstrualPeriod = ''; // 其他值清空
            }
        }
        
        // 解析人员类型和归属地
        let personType = this.getCellValue(row, columnMap.personType) || '';
        personType = String(personType).trim();
        // 标准化人员类型
        if (personType) {
            if (personType.includes('全人力侦测')) {
                personType = '全人力侦测';
            } else if (personType.includes('半人力授权') && personType.includes('侦测')) {
                personType = '半人力授权+侦测';
            } else if (personType.includes('全人力授权') && personType.includes('大夜')) {
                personType = '全人力授权+大夜侦测';
            } else if (personType.includes('授权人员支援') || (personType.includes('授权') && personType.includes('大夜授权'))) {
                personType = '授权人员支援侦测+大夜授权';
            }
        }
        
        let location = this.getCellValue(row, columnMap.location) || '';
        location = String(location).trim();
        // 标准化归属地
        if (location) {
            if (location.includes('上海') || location.toLowerCase().includes('shanghai')) {
                location = '上海';
            } else if (location.includes('成都') || location.toLowerCase().includes('chengdu')) {
                location = '成都';
            }
        }

        // 解析积分相关数据（默认0）
        const lastYearSpringFestival = this.parseNumber(this.getCellValue(row, columnMap.lastYearSpringFestival)) || 0;
        const lastYearNationalDay = this.parseNumber(this.getCellValue(row, columnMap.lastYearNationalDay)) || 0;
        
        // 计算当年节假上班天数（默认0）
        let currentYearHolidays = 0;
        if (columnMap.currentYearHolidays !== -1) {
            currentYearHolidays = this.parseNumber(this.getCellValue(row, columnMap.currentYearHolidays)) || 0;
        }

        // 计算积分（使用默认系数，后续可通过公式配置修改）
        // 默认：上年春节×10 + 上年国庆×8 + 当年节假×5
        const defaultSpringCoeff = 10;
        const defaultNationalCoeff = 8;
        const defaultHolidayCoeff = 5;
        
        const priorityScore = (lastYearSpringFestival * defaultSpringCoeff) + 
                             (lastYearNationalDay * defaultNationalCoeff) + 
                             (currentYearHolidays * defaultHolidayCoeff);

        // 验证数据矛盾（仅校验非女性不应填写生理期，已在上方处理）

        // 构建人员对象
        const staff = {
            id: String(id).trim(),
            name: String(name).trim(),
            canNightShift: canNightShift,  // 大夜是否可排（是/否）
            gender: String(gender).trim(),
            skills: skills,
            lastMonthNightShiftDays: lastMonthNightShiftDays,  // 上个月的大夜天数
            menstrualPeriod: menstrualPeriod, // '上' 或 '下' 或空（仅女性）
            personType: personType,      // 人员类型
            location: location,          // 归属地
            // 积分相关
            lastYearSpringFestival: lastYearSpringFestival,
            lastYearNationalDay: lastYearNationalDay,
            currentYearHolidays: currentYearHolidays,
            priorityScore: priorityScore
        };

        // 如果有错误，返回错误信息
        if (errors.length > 0) {
            return {
                staff: staff,
                error: errors
            };
        }

        return staff;
    },

    /**
     * 获取单元格值
     * @param {Array} row - 数据行
     * @param {number} index - 列索引
     * @returns {*} 单元格值
     */
    getCellValue(row, index) {
        if (index === -1 || index >= row.length) {
            return '';
        }
        return row[index];
    },

    /**
     * 解析布尔值
     * @param {*} value - 原始值
     * @returns {boolean} 布尔值
     */
    parseBoolean(value) {
        if (value === null || value === undefined || value === '') {
            return false;
        }
        const str = String(value).toLowerCase().trim();
        return str === '是' || str === 'yes' || str === 'y' || str === 'true' || str === '1' || value === true || value === 1;
    },

    /**
     * 解析数字
     * @param {*} value - 原始值
     * @returns {number|null} 数字值
     */
    parseNumber(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const num = Number(value);
        return isNaN(num) ? null : num;
    },

    /**
     * 处理文件上传并更新状态
     * @param {File} file - 上传的文件
     * @param {string} fileType - 文件类型：'staff' (人员数据) 或 'requirements' (需求配置)
     */
    async processFile(file, fileType = 'staff') {
        try {
            console.log('开始处理文件:', file.name, '类型:', fileType);
            
            if (fileType === 'requirements') {
                // 处理需求配置表
                return await this.processRequirementsFile(file);
            } else {
                // 处理人员数据
                return await this.processStaffFile(file);
            }
        } catch (error) {
            console.error('文件处理失败:', error);
            this.updateStatus(`错误: ${error.message}`, 'error');
            throw error;
        }
    },

    /**
     * 处理人员数据文件
     * @param {File} file - 上传的文件
     */
    async processStaffFile(file) {
        // 加载并解析 Excel 文件
        const staffData = await this.loadExcelFile(file);
        
        if (staffData.length === 0) {
            throw new Error('未找到有效的人员数据');
        }

            // 完全清空内存中的员工数据
            Store.state.staffDataHistory = {};
            
            // 保存到 Store（使用新的批量添加方法）
            Store.batchAddStaffData(staffData);
            
            // 保存到IndexedDB
            if (typeof DB !== 'undefined' && DB.db) {
                const updatedStaffDataHistory = Store.getState('staffDataHistory');
                for (const [staffId, history] of Object.entries(updatedStaffDataHistory)) {
                    await DB.saveStaffHistory(staffId, history);
                }
            }
            
            // 打印数据预览
            console.log('数据解析成功！共', staffData.length, '条人员记录');
            console.log('数据预览:', staffData);
            console.table(staffData.map(s => ({
                ID: s.id,
                姓名: s.name,
                性别: s.gender,
                大夜是否可排: s.canNightShift === '否' ? '否' : '',
                技能: s.skills.join(','),
                上个月大夜天数: s.lastMonthNightShiftDays || 0,
                上下半月偏好: s.menstrualPeriod || '',
                上年春节: s.lastYearSpringFestival || 0,
                上年国庆: s.lastYearNationalDay || 0,
                当年节假: s.currentYearHolidays || 0,
                人员类型: s.personType || '未设置',
                归属地: s.location || '未设置',
                积分: s.priorityScore || 0
            })));

            // 更新状态提示
            this.updateStatus(`成功加载 ${staffData.length} 条人员数据，旧数据已自动失效`, 'success');
            
            return staffData;
    },

    /**
     * 处理个人需求文件（批量上传）
     * @param {File} file - 上传的文件
     */
    async processPersonalRequestsFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const fileName = file.name.toLowerCase();
            const isCSV = fileName.endsWith('.csv');
            
            reader.onload = (e) => {
                try {
                    let jsonData;
                    
                    if (isCSV) {
                        // 处理CSV文件
                        const text = e.target.result;
                        const lines = text.split('\n').filter(line => line.trim());
                        jsonData = lines.map(line => {
                            return line.split(/[,;]/).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
                        });
                    } else {
                        // 处理Excel文件
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                            header: 1,
                            defval: ''
                        });
                    }
                    
                    if (jsonData.length < 2) {
                        throw new Error('文件格式错误：至少需要表头和数据行');
                    }
                    
                    // 解析表头
                    const headers = jsonData[0];
                    const idIndex = headers.findIndex(h => {
                        const hLower = String(h).toLowerCase().trim();
                        return hLower === 'id' || hLower === '人员id' || hLower === '员工id';
                    });
                    
                    if (idIndex === -1) {
                        throw new Error('未找到ID列，请确保第一列为"ID"或"人员ID"');
                    }
                    
                    // 解析日期列（从第三列开始，第一列是ID，第二列是姓名）
                    const dateColumns = [];
                    headers.forEach((header, index) => {
                        if (index > 1) { // 跳过ID和姓名列
                            const headerStr = String(header).trim();
                            // 尝试解析为日期
                            if (headerStr.match(/^\d{4}-\d{2}-\d{2}$/) || headerStr.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
                                let dateStr = headerStr;
                                // 转换日期格式
                                if (dateStr.includes('/')) {
                                    const parts = dateStr.split('/');
                                    dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                                }
                                dateColumns.push({ index: index, dateStr: dateStr });
                            }
                        }
                    });
                    
                    if (dateColumns.length === 0) {
                        throw new Error('未找到有效的日期列，请确保列标题为日期格式（YYYY-MM-DD）');
                    }
                    
                    // 解析数据行
                    const allRequests = {};
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        const staffId = String(row[idIndex] || '').trim();
                        
                        if (!staffId) {
                            continue; // 跳过空行
                        }
                        
                        const requests = {};
                        dateColumns.forEach(({ index, dateStr }) => {
                            const cellValue = String(row[index] || '').trim().toUpperCase();
                            if (cellValue === 'REQ' || cellValue === '申请休假' || cellValue === '休假') {
                                requests[dateStr] = 'REQ';
                            }
                        });
                        
                        if (Object.keys(requests).length > 0) {
                            allRequests[staffId] = requests;
                        }
                    }
                    
                    // 批量更新到 Store
                    for (const staffId in allRequests) {
                        if (allRequests.hasOwnProperty(staffId)) {
                            Store.setPersonalRequests(staffId, allRequests[staffId]);
                        }
                    }
                    
                    // 保存到IndexedDB
                    if (typeof DB !== 'undefined' && DB.db) {
                        Store.saveState();
                    }
                    
                    this.updateStatus(`成功导入 ${Object.keys(allRequests).length} 条人员需求数据`, 'success');
                    resolve(allRequests);
                } catch (error) {
                    console.error('解析个人需求文件失败:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            if (isCSV) {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    },

    /**
     * 处理需求配置文件
     * @param {File} file - 上传的文件
     */
    async processRequirementsFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // 读取第一个工作表
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // 转换为 JSON 格式
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        defval: '' 
                    });
                    
                    // 解析需求配置
                    const requirements = this.parseRequirementsData(jsonData);
                    
                    // 保存到 Store
                    Store.setState('requirements', requirements);
                    
                    console.log('需求配置解析成功:', requirements);
                    this.updateStatus('需求配置加载成功', 'success');
                    
                    resolve(requirements);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * 解析需求配置数据
     * @param {Array<Array>} rawData - Excel 原始数据（二维数组）
     * @returns {Object} 需求配置对象
     */
    parseRequirementsData(rawData) {
        if (!rawData || rawData.length < 2) {
            throw new Error('需求配置表格式不正确');
        }

        const requirements = {
            全人力侦测: { 上海: 0, 成都: 0 },
            '半人力授权+侦测': { 上海: 0, 成都: 0 },
            '全人力授权+大夜侦测': { 上海: 0, 成都: 0 },
            '授权人员支援侦测+大夜授权': { 上海: 0, 成都: 0 }
        };

        // 第一行作为表头
        const headers = rawData[0].map(h => String(h).trim());
        
        // 查找列索引
        let typeColumnIndex = -1;
        let shanghaiColumnIndex = -1;
        let chengduColumnIndex = -1;
        
        headers.forEach((header, index) => {
            const headerLower = String(header).toLowerCase().trim();
            if (headerLower.includes('类型') || headerLower.includes('任务') || headerLower.includes('全人力') || headerLower.includes('半人力')) {
                typeColumnIndex = index;
            } else if (headerLower.includes('上海') || headerLower === '上海') {
                shanghaiColumnIndex = index;
            } else if (headerLower.includes('成都') || headerLower === '成都') {
                chengduColumnIndex = index;
            }
        });

        // 解析数据行
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (row.every(cell => !cell || String(cell).trim() === '')) {
                continue;
            }

            const type = typeColumnIndex !== -1 ? String(row[typeColumnIndex] || '').trim() : '';
            const shanghaiValue = shanghaiColumnIndex !== -1 ? this.parseNumber(row[shanghaiColumnIndex]) || 0 : 0;
            const chengduValue = chengduColumnIndex !== -1 ? this.parseNumber(row[chengduColumnIndex]) || 0 : 0;

            if (type) {
                // 匹配人员类型
                let matchedType = null;
                if (type.includes('全人力侦测') && !type.includes('授权')) {
                    matchedType = '全人力侦测';
                } else if (type.includes('半人力授权') && type.includes('侦测')) {
                    matchedType = '半人力授权+侦测';
                } else if (type.includes('全人力授权') && type.includes('大夜')) {
                    matchedType = '全人力授权+大夜侦测';
                } else if (type.includes('授权人员支援') || (type.includes('授权') && type.includes('大夜授权'))) {
                    matchedType = '授权人员支援侦测+大夜授权';
                }

                if (matchedType && requirements[matchedType]) {
                    requirements[matchedType].上海 = shanghaiValue;
                    requirements[matchedType].成都 = chengduValue;
                }
            }
        }

        return requirements;
    },

    /**
     * 更新状态提示
     * @param {string} message - 提示消息
     * @param {string} type - 类型：'success', 'error', 'info'
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
    }
};

// 导出（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataLoader;
}

