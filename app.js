document.addEventListener('DOMContentLoaded', () => {
    // --- Globals & Constants ---
    const LS_DROPS_KEY = 'gameDropsData_v1';
    const LS_CONFIG_SERIES_KEY = 'gameDropsConfigSeries_v1';
    const LS_CONFIG_EXPECTED_KEY = 'gameDropsConfigExpected_v1';

    const DEFAULT_SERIES = ['勇气', '贵族', '吞火', '刺壳', '追猎', '气功'];
    const PARTS = ['头部', '披风', '靴子', '胸部', '项链', '戒指'];

    // --- DOM Elements ---
    const entryForm = document.getElementById('entryForm');
    const entryDate = document.getElementById('entryDate');
    const entrySeries = document.getElementById('entrySeries');
    const entryPart = document.getElementById('entryPart');
    const entryRuns = document.getElementById('entryRuns'); // NEW
    const entryMessage = document.getElementById('entryMessage');

    const recordsTableBody = document.getElementById('recordsTable').querySelector('tbody');
    const recordsMessage = document.getElementById('recordsMessage');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const exportBtn = document.getElementById('exportBtn');

    const editModalElement = document.getElementById('editModal');
    const editModal = new bootstrap.Modal(editModalElement);
    const editForm = document.getElementById('editForm');
    const editRecordId = document.getElementById('editRecordId');
    const editDate = document.getElementById('editDate');
    const editSeries = document.getElementById('editSeries');
    const editPart = document.getElementById('editPart');
    const editRuns = document.getElementById('editRuns'); // NEW
    const saveEditBtn = document.getElementById('saveEditBtn');

    const stackToggle = document.getElementById('stackToggle');
    const seriesPartTotalSpan = document.getElementById('seriesPartTotal');
    const cosineSimilarityValueSpan = document.getElementById('cosineSimilarityValue');

    const newSeriesInput = document.getElementById('newSeriesInput');
    const addSeriesBtn = document.getElementById('addSeriesBtn');
    const seriesList = document.getElementById('seriesList');
    const expectedDistForm = document.getElementById('expectedDistForm');
    const expectedDistTableContainer = document.getElementById('expectedDistTableContainer');
    const expectedPercentagesDiv = document.getElementById('expectedPercentages');
    const saveExpectedBtn = document.getElementById('saveExpectedBtn');
    const configMessage = document.getElementById('configMessage');

    // --- ECharts Instances ---
    let charts = {}; // Store chart instances { id: instance }

    // --- Data Store ---
    let drops = []; // Array of {id, date, series, part, runs} // MODIFIED
    let configSeries = []; // Array of series names
    let configExpected = {}; // Object { "Series-Part": count }

    // --- Utility Functions ---
    const loadData = (key, defaultValue) => {
        const data = localStorage.getItem(key);
        if (data) {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.error(`Error parsing localStorage key "${key}":`, e);
                return defaultValue;
            }
        }
        return defaultValue;
    };

    const saveData = (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error(`Error saving localStorage key "${key}":`, e);
            alert(`保存 ${key} 到 localStorage 时出错! ${e.message}`);
        }
    };

    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

    const displayMessage = (element, message, type = 'success') => {
        element.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
                              ${message}
                              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                            </div>`;
        // Auto-dismiss after 5 seconds for success/info
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                const alert = element.querySelector('.alert');
                if (alert) {
                    bootstrap.Alert.getOrCreateInstance(alert).close();
                }
            }, 5000);
        }
    };

    const getSeriesPartKey = (series, part) => `${series}-${part}`;

    // --- UI Update Functions ---
    const populateDropdowns = () => {
        const populateSelect = (selectElement) => {
            selectElement.innerHTML = ''; // Clear existing options
            configSeries.forEach(series => {
                const option = document.createElement('option');
                option.value = series;
                option.textContent = series;
                selectElement.appendChild(option);
            });
            // Add default value if empty to avoid errors, although config should prevent this
            if (configSeries.length === 0) {
                 const option = document.createElement('option');
                 option.value = "";
                 option.textContent = "请先配置系列";
                 option.disabled = true;
                 selectElement.appendChild(option);
            }
        }
        populateSelect(entrySeries);
        populateSelect(editSeries);
    };

    const renderRecordsTable = () => {
        recordsTableBody.innerHTML = ''; // Clear table
        if (drops.length === 0) {
            recordsTableBody.innerHTML = '<tr><td colspan="5" class="text-center">暂无记录</td></tr>'; // Modified colspan
            return;
        }
        // Sort by date descending
        const sortedDrops = [...drops].sort((a, b) => b.date.localeCompare(a.date));

        sortedDrops.forEach(record => {
            const row = recordsTableBody.insertRow();
            row.innerHTML = `
                <td>${record.date}</td>
                <td>${record.series}</td>
                <td>${record.part}</td>
                <td>${record.runs}</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-btn me-1" data-id="${record.id}">编辑</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${record.id}">删除</button>
                </td>
            `;
        });
        // Add event listeners after rendering
        addTableActionListeners();
    };

    const addTableActionListeners = () => {
        recordsTableBody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', handleEditClick);
        });
        recordsTableBody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteClick);
        });
    };

    const renderSeriesList = () => {
        seriesList.innerHTML = '';
        if (configSeries.length === 0) {
             seriesList.innerHTML = '<li class="list-group-item">暂无系列，请添加</li>';
             return;
        }
        configSeries.forEach(series => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.textContent = series;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-outline-danger btn-sm delete-series-btn';
            deleteBtn.textContent = '删除';
            deleteBtn.dataset.series = series;
            deleteBtn.addEventListener('click', handleDeleteSeriesClick);
            li.appendChild(deleteBtn);
            seriesList.appendChild(li);
        });
    };

    const renderExpectedForm = () => {
        expectedDistTableContainer.innerHTML = ''; // Clear previous
        expectedPercentagesDiv.innerHTML = '<h5>期望分布百分比:</h5>'; // Clear previous percentages

        if (configSeries.length === 0 || PARTS.length === 0) {
            expectedDistTableContainer.innerHTML = '<p>请先在上方添加至少一个装备系列。</p>';
            return;
        }

        let tableHTML = '<table id="expectedDistTable" class="table table-bordered table-sm"><thead><tr><th>系列 \\ 部位</th>';
        PARTS.forEach(part => tableHTML += `<th>${part}</th>`);
        tableHTML += '</tr></thead><tbody>';

        let totalExpectedCount = 0;
        const currentExpected = { ...configExpected }; // Use current state for display

        configSeries.forEach(series => {
            tableHTML += `<tr><th>${series}</th>`;
            PARTS.forEach(part => {
                const key = getSeriesPartKey(series, part);
                const value = currentExpected[key] || 0;
                tableHTML += `<td><input type="number" class="form-control form-control-sm expected-input" data-series="${series}" data-part="${part}" value="${value}" min="0"></td>`;
                totalExpectedCount += Number(value); // Use Number() to ensure numeric addition
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';
        expectedDistTableContainer.innerHTML = tableHTML;

        // Calculate and display percentages
        if (totalExpectedCount > 0) {
            let percentageHTML = '<ul class="list-unstyled">';
            configSeries.forEach(series => {
                PARTS.forEach(part => {
                    const key = getSeriesPartKey(series, part);
                    const count = currentExpected[key] || 0;
                    const percentage = ((count / totalExpectedCount) * 100).toFixed(2);
                    if (count > 0) { // Only show non-zero percentages
                       percentageHTML += `<li>${key}: ${percentage}%</li>`;
                    }
                });
            });
            percentageHTML += '</ul>';
             expectedPercentagesDiv.innerHTML += percentageHTML;
        } else {
             expectedPercentagesDiv.innerHTML += '<p>未设置期望数量或总数为0。</p>';
        }

        // Add listeners to new inputs
        expectedDistTableContainer.querySelectorAll('.expected-input').forEach(input => {
            // Optional: Add input listeners if real-time updates are desired (though save button is primary)
        });
    };


    // --- ECharts Chart Update Functions ---

    const initChart = (id) => {
        const container = document.getElementById(id);
        if (!container) {
             console.error(`Chart container not found: ${id}`);
             return null;
        }
        // Dispose existing chart if it exists
        if (charts[id]) {
            charts[id].dispose();
        }
        const chart = echarts.init(container);
        charts[id] = chart; // Store the instance
        return chart;
    };

    const updateAllCharts = () => {
        // Basic Stats
        updateSeriesDistChart();
        updatePartDistChart();
        updateSeriesPartDistChart();

        // Advanced Stats
        updateExpectedActualDistChart();
        updateTimeTrendCharts(); // This implicitly calculates and updates similarity display too
    };

    // Debounce resize function
    let resizeTimeout;
    const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            Object.values(charts).forEach(chart => {
                if (chart && typeof chart.resize === 'function') {
                    chart.resize();
                }
            });
        }, 250); // Adjust debounce delay as needed
    };


    const updateSeriesDistChart = () => {
        const chart = charts['seriesDistChart'] || initChart('seriesDistChart');
        if (!chart) return;

        const seriesCounts = {};
        configSeries.forEach(s => seriesCounts[s] = 0); // Initialize all configured series
        drops.forEach(d => {
            if (seriesCounts.hasOwnProperty(d.series)) {
                seriesCounts[d.series]++;
            }
            // Optional: handle drops with series no longer in config? For now, ignore them in the chart.
        });

        const data = Object.entries(seriesCounts).map(([name, value]) => ({ name, value }));
        const total = data.reduce((sum, item) => sum + item.value, 0);

        const option = {
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c} ({d}%)'
            },
            legend: {
                orient: 'vertical',
                left: 'left',
                data: data.map(item => item.name)
            },
            series: [
                {
                    name: '系列分布',
                    type: 'pie',
                    radius: '70%',
                    center: ['60%', '50%'], // Adjust center to accommodate legend
                    data: data,
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    },
                     label: {
                        formatter: '{b}: {@value} ({d}%)'
                    }
                }
            ]
        };
        chart.setOption(option, true); // Use true to clear previous options
    };

     const updatePartDistChart = () => {
        const chart = charts['partDistChart'] || initChart('partDistChart');
        if (!chart) return;

        const partCounts = {};
        PARTS.forEach(p => partCounts[p] = 0); // Initialize all parts
        drops.forEach(d => {
            if (partCounts.hasOwnProperty(d.part)) {
                partCounts[d.part]++;
            }
        });

        const data = Object.entries(partCounts).map(([name, value]) => ({ name, value }));

        const option = {
             tooltip: {
                trigger: 'item',
                formatter: '{b}: {c} ({d}%)'
            },
            legend: {
                orient: 'vertical',
                left: 'left',
                data: data.map(item => item.name)
            },
            series: [
                {
                    name: '部位分布',
                    type: 'pie',
                    radius: '70%',
                    center: ['60%', '50%'],
                    data: data,
                     emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    },
                    label: {
                        formatter: '{b}: {@value} ({d}%)'
                    }
                }
            ]
        };
         chart.setOption(option, true);
    };

    const updateSeriesPartDistChart = () => {
        const chart = charts['seriesPartDistChart'] || initChart('seriesPartDistChart');
        if (!chart) return;

        const isStacked = stackToggle.checked;
        const seriesPartCounts = {}; // { "Series-Part": count }
        const seriesTotals = {}; // { "Series": count }
        configSeries.forEach(s => {
            seriesTotals[s] = 0;
            PARTS.forEach(p => seriesPartCounts[getSeriesPartKey(s, p)] = 0);
        });

        drops.forEach(d => {
            const key = getSeriesPartKey(d.series, d.part);
            if (seriesPartCounts.hasOwnProperty(key)) {
                seriesPartCounts[key]++;
                seriesTotals[d.series]++;
            }
        });
        const totalDrops = drops.length;
        seriesPartTotalSpan.textContent = totalDrops;


        let option;
        if (isStacked) {
            // Stacked Bar Chart: X-axis = Series, Stacks = Parts
            const seriesData = PARTS.map(part => ({
                name: part,
                type: 'bar',
                stack: 'total', // All parts stack together for each series
                emphasis: { focus: 'series' },
                data: configSeries.map(series => seriesPartCounts[getSeriesPartKey(series, part)] || 0)
            }));

            option = {
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { data: PARTS },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: { type: 'category', data: configSeries },
                yAxis: { type: 'value' },
                series: seriesData
            };
        } else {
            // Grouped Bar Chart: X-axis = Series-Part Combination
            const xAxisData = [];
            const seriesChartData = [];
            configSeries.forEach(series => {
                PARTS.forEach(part => {
                    const key = getSeriesPartKey(series, part);
                    const count = seriesPartCounts[key];
                    if (count > 0) { // Only show combinations with drops
                       xAxisData.push(key);
                       seriesChartData.push(count);
                    }
                });
            });

            option = {
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true }, // More bottom margin for rotated labels if needed
                xAxis: {
                    type: 'category',
                    data: xAxisData,
                    axisLabel: {
                        interval: 0, // Show all labels
                        // rotate: 30 // Rotate if labels overlap too much
                    }
                },
                yAxis: { type: 'value' },
                 dataZoom: [ // Add data zoom for better navigation with many bars
                    { type: 'inside', start: 0, end: 100 },
                    { type: 'slider', start: 0, end: 100, bottom: 5 }
                ],
                series: [{
                    name: '掉落数量',
                    type: 'bar',
                    data: seriesChartData,
                     barMaxWidth: 50, // Prevent bars from becoming too wide
                     itemStyle: { // Optional: Color by series or part, here just default
                        // color: (params) => { /* logic to color */ }
                     }
                }]
            };
        }
        chart.setOption(option, true);
    };

     const updateExpectedActualDistChart = () => {
        const chart = charts['expectedActualDistChart'] || initChart('expectedActualDistChart');
        if (!chart) return;

        const isStacked = stackToggle.checked;

        // 1. Calculate Actual Distribution (Percentages)
        const actualCounts = {};
        const actualPercentages = {};
        let totalDrops = drops.length;
        configSeries.forEach(s => PARTS.forEach(p => actualCounts[getSeriesPartKey(s, p)] = 0));
        drops.forEach(d => {
             const key = getSeriesPartKey(d.series, d.part);
             if(actualCounts.hasOwnProperty(key)) {
                 actualCounts[key]++;
             }
        });
        if (totalDrops > 0) {
            for (const key in actualCounts) {
                actualPercentages[key] = (actualCounts[key] / totalDrops) * 100;
            }
        } else {
             configSeries.forEach(s => PARTS.forEach(p => actualPercentages[getSeriesPartKey(s, p)] = 0));
        }


        // 2. Calculate Expected Distribution (Percentages)
        const expectedPercentages = {};
        let totalExpectedCount = 0;
        const currentExpected = { ...configExpected }; // Use current saved state
        for (const key in currentExpected) {
            totalExpectedCount += Number(currentExpected[key]);
        }
        if (totalExpectedCount > 0) {
             configSeries.forEach(s => PARTS.forEach(p => {
                 const key = getSeriesPartKey(s, p);
                 expectedPercentages[key] = ((currentExpected[key] || 0) / totalExpectedCount) * 100;
             }));
        } else {
             configSeries.forEach(s => PARTS.forEach(p => expectedPercentages[getSeriesPartKey(s, p)] = 0));
        }


        // 3. Prepare Chart Data
        let option;
        if (isStacked) {
            // Stacked Bar: X-axis = Series, Stacks = Parts, Two sets of stacks (Actual/Expected)
            const legendData = [...PARTS.map(p => `实际-${p}`), ...PARTS.map(p => `期望-${p}`)];
            const seriesData = [];

             // Actual Data Series
             PARTS.forEach(part => {
                 seriesData.push({
                    name: `实际-${part}`,
                    type: 'bar',
                    stack: '实际',
                    emphasis: { focus: 'series' },
                    data: configSeries.map(series => actualPercentages[getSeriesPartKey(series, part)] || 0)
                 });
             });

             // Expected Data Series
             PARTS.forEach(part => {
                 seriesData.push({
                    name: `期望-${part}`,
                    type: 'bar',
                    stack: '期望',
                    emphasis: { focus: 'series' },
                    data: configSeries.map(series => expectedPercentages[getSeriesPartKey(series, part)] || 0)
                 });
             });


             option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                     formatter: (params) => {
                        let tooltipText = `${params[0].name}<br/>`; // Series Name
                        const grouped = {}; // Group by stack (Actual/Expected)
                        params.forEach(p => {
                            const stackName = p.seriesName.split('-')[0]; // Actual or Expected
                            const partName = p.seriesName.split('-')[1]; // Part Name
                            if (!grouped[stackName]) grouped[stackName] = [];
                            if(p.value > 0) { // Only show parts with value > 0
                                grouped[stackName].push(`${p.marker}${partName}: ${p.value.toFixed(2)}%`);
                            }
                        });
                         if (grouped['实际']) tooltipText += `<strong>实际:</strong><br/>${grouped['实际'].join('<br/>')}<br/>`;
                         if (grouped['期望']) tooltipText += `<strong>期望:</strong><br/>${grouped['期望'].join('<br/>')}`;
                         return tooltipText;
                     }
                },
                legend: { type: 'scroll', bottom: 5, data: legendData }, // Use scrollable legend
                grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                xAxis: { type: 'category', data: configSeries },
                yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
                series: seriesData
            };

        } else {
            // Grouped Bar: X-axis = Series-Part, Bars = Actual/Expected
            const xAxisData = [];
            const actualData = [];
            const expectedData = [];

             configSeries.forEach(series => {
                 PARTS.forEach(part => {
                     const key = getSeriesPartKey(series, part);
                     // Include if either actual or expected is > 0 to compare
                     if ((actualPercentages[key] || 0) > 0 || (expectedPercentages[key] || 0) > 0) {
                         xAxisData.push(key);
                         actualData.push(actualPercentages[key] || 0);
                         expectedData.push(expectedPercentages[key] || 0);
                     }
                 });
             });

             option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: '{b}<br/>{a0}: {c0}%<br/>{a1}: {c1}%'
                },
                legend: { data: ['实际分布', '期望分布'] },
                grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
                xAxis: {
                    type: 'category',
                    data: xAxisData,
                    axisLabel: { interval: 0 /*, rotate: 30 */ }
                },
                yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
                 dataZoom: [
                    { type: 'inside', start: 0, end: 100 },
                    { type: 'slider', start: 0, end: 100, bottom: 5 }
                ],
                series: [
                    { name: '实际分布', type: 'bar', data: actualData, barGap: 0, /* Optional: color */ },
                    { name: '期望分布', type: 'bar', data: expectedData, /* Optional: color */ }
                ]
            };
        }
         chart.setOption(option, true);
    };

    // --- Cosine Similarity Calculation ---
    const calculateCosineSimilarity = (vecA, vecB) => {
        let dotProduct = 0;
        let magA = 0;
        let magB = 0;
        if (vecA.length !== vecB.length || vecA.length === 0) {
            return 0; // Vectors must be same length and non-zero
        }
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
            magA += Math.pow(vecA[i] || 0, 2);
            magB += Math.pow(vecB[i] || 0, 2);
        }
        magA = Math.sqrt(magA);
        magB = Math.sqrt(magB);
        if (magA === 0 || magB === 0) {
            return 0; // Avoid division by zero
        }
        return dotProduct / (magA * magB);
    };

    const getDistributionVectors = (targetDrops, referenceExpected = configExpected) => {
        const keys = [];
        configSeries.forEach(s => PARTS.forEach(p => keys.push(getSeriesPartKey(s, p))));
        keys.sort(); // Ensure consistent order

        // Actual Vector (from targetDrops)
        const actualCounts = {};
        keys.forEach(k => actualCounts[k] = 0);
        let totalActual = targetDrops.length;
        targetDrops.forEach(d => {
            const key = getSeriesPartKey(d.series, d.part);
            if (actualCounts.hasOwnProperty(key)) {
                actualCounts[key]++;
            }
        });
        const actualVector = keys.map(k => totalActual > 0 ? (actualCounts[k] / totalActual) : 0);

        // Expected Vector (from referenceExpected config)
        const expectedCounts = { ...referenceExpected };
        let totalExpected = 0;
        keys.forEach(k => totalExpected += (Number(expectedCounts[k]) || 0));
        const expectedVector = keys.map(k => totalExpected > 0 ? ((expectedCounts[k] || 0) / totalExpected) : 0);

        return { actualVector, expectedVector };
    };


    // --- Time Trend Chart Updates ---
    const updateTimeTrendCharts = () => {
        const countChart = charts['countTrendChart'] || initChart('countTrendChart');
        const similarityChart = charts['similarityTrendChart'] || initChart('similarityTrendChart');
        if (!countChart || !similarityChart) return;

        if (drops.length === 0) {
            // Display message or clear charts if no data
            countChart.clear();
            similarityChart.clear();
            cosineSimilarityValueSpan.textContent = 'N/A (无数据)';
            return;
        }


        // Group drops by date
        const dropsByDate = {};
        drops.forEach(drop => {
            if (!dropsByDate[drop.date]) {
                dropsByDate[drop.date] = [];
            }
            dropsByDate[drop.date].push(drop);
        });

        const sortedDates = Object.keys(dropsByDate).sort();

        const countData = [];
        const similarityData = [];
        //NEW: Runs Data & Cumulative Drop Chance
        const runsData = [];
        let cumulativeDrops = 0;
        let cumulativeRuns = 0;
        const cumulativeDropChanceData = [];

        // Calculate overall similarity first
        const overallVectors = getDistributionVectors(drops);
        const overallSimilarity = calculateCosineSimilarity(overallVectors.actualVector, overallVectors.expectedVector);
        cosineSimilarityValueSpan.textContent = isNaN(overallSimilarity) ? 'N/A (期望或实际分布为零)' : overallSimilarity.toFixed(4);


        // Calculate daily counts and similarities
        sortedDates.forEach(date => {
            const dailyDrops = dropsByDate[date];
            const dailyRuns = dailyDrops.reduce((sum, drop) => sum + drop.runs, 0); // Sum runs for the day

            countData.push([date, dailyDrops.length]);
            runsData.push([date, dailyRuns]);

            // Calculate similarity for this day's drops vs the *overall* expected distribution
            const dailyVectors = getDistributionVectors(dailyDrops);
            const dailySimilarity = calculateCosineSimilarity(dailyVectors.actualVector, overallVectors.expectedVector);
             if (!isNaN(dailySimilarity)) { // Only add valid similarity scores
                 similarityData.push([date, dailySimilarity]);
             } else {
                  similarityData.push([date, null]); // Represent invalid data as null for gaps in line chart
             }

             // Calculate cumulative drop chance
             cumulativeDrops += dailyDrops.length;
             cumulativeRuns += dailyRuns;
             const dropChance = cumulativeRuns > 0 ? (cumulativeDrops / cumulativeRuns) : 0;
             cumulativeDropChanceData.push([date, dropChance]);
        });

        // Update Count Trend Chart
        const countOption = {
            tooltip: {
              trigger: 'axis',
              axisPointer: { type: 'cross' },
              formatter: (params) => {
                const date = params[0].axisValueLabel;
                let tooltipText = `<strong>${date}</strong><br/>`;
                params.forEach(param => {
                  tooltipText += `${param.marker} ${param.seriesName}: ${param.value}<br/>`;
                });
                return tooltipText;
              }
            },
            legend: { data: ['每日掉落数量', '每日副本次数', '累积掉落概率'] }, // Add legend
            xAxis: { type: 'time' }, // Use time axis
            yAxis: [
               { type: 'value', name: '数量', min: 0 },
               { type: 'value', name: '掉落概率', min: 0, max: 1, axisLabel: {formatter: '{value}'} } // Adjust max as needed

            ],
            dataZoom: [{ type: 'inside' }, { type: 'slider' }],
             grid: { left: '10%', right: '10%', bottom: '15%', containLabel: true },
            series: [
              {
                name: '每日掉落数量',
                type: 'line',
                smooth: true,
                data: countData, // Array of [dateString, value]
                areaStyle: {}, // Optional: fill area under line
              },
              {
                name: '每日副本次数',
                type: 'line',
                smooth: true,
                data: runsData,
                //yAxisIndex: 1 // Use the second yAxis
              },
              {
                name: '累积掉落概率',
                type: 'line',
                smooth: true,
                data: cumulativeDropChanceData,
                yAxisIndex: 1, // Use the second yAxis
                //symbol: 'none' // Remove symbols to declutter the chart
              }
            ]
        };
        countChart.setOption(countOption, true);

        // Update Similarity Trend Chart
        const similarityOption = {
            tooltip: { trigger: 'axis', formatter: '{b}: {c0}' },
            xAxis: { type: 'time' },
            yAxis: { type: 'value', name: '余弦相似度', min: 0, max: 1 }, // Similarity ranges from 0 to 1 (or -1 to 1, but percentages are non-negative)
             dataZoom: [{ type: 'inside' }, { type: 'slider' }],
             grid: { left: '10%', right: '10%', bottom: '15%', containLabel: true },
            series: [{
                name: '每日分布相似度',
                type: 'line',
                smooth: true,
                data: similarityData, // Array of [dateString, value]
                connectNulls: false // Do not connect points across null values
            }]
        };
        similarityChart.setOption(similarityOption, true);
    };


    // --- Event Handlers ---

    // Entry Form Submit
    entryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const date = entryDate.value;
        const series = entrySeries.value;
        const part = entryPart.value;
        const runs = parseInt(entryRuns.value, 10); // NEW

        if (!date || !series || !part || isNaN(runs) || runs <= 0) {
            displayMessage(entryMessage, '请填写所有字段，次数必须是正整数！', 'warning');
            return;
        }

        const newRecord = {
            id: generateId(),
            date: date,
            series: series,
            part: part,
            runs: runs // NEW
        };

        drops.push(newRecord);
        saveData(LS_DROPS_KEY, drops);
        renderRecordsTable();
        updateAllCharts(); // Update charts after adding data
        entryForm.reset();
        entryDate.valueAsDate = new Date(); // Reset date to today
        entryRuns.value = 1; // Reset runs to default
        displayMessage(entryMessage, '记录添加成功！', 'success');
    });

    // Edit Button Click (delegated listener set in renderRecordsTable)
    function handleEditClick(e) {
        const id = e.target.dataset.id;
        const record = drops.find(d => d.id === id);
        if (record) {
            editRecordId.value = record.id;
            editDate.value = record.date;
            editSeries.value = record.series; // Assumes series exists in dropdown
            editPart.value = record.part;
            editRuns.value = record.runs; //NEW
            editModal.show();
        }
    }

    // Save Edit Button Click
    saveEditBtn.addEventListener('click', () => {
        const id = editRecordId.value;
        const updatedRecord = {
            id: id,
            date: editDate.value,
            series: editSeries.value,
            part: editPart.value,
            runs: parseInt(editRuns.value, 10) // NEW
        };

        if (!updatedRecord.date || !updatedRecord.series || !updatedRecord.part || isNaN(updatedRecord.runs) || updatedRecord.runs <= 0) {
             alert('编辑表单中的所有字段都必须填写，次数必须是正整数！'); // Use alert in modal
             return;
        }

        const index = drops.findIndex(d => d.id === id);
        if (index !== -1) {
            drops[index] = updatedRecord;
            saveData(LS_DROPS_KEY, drops);
            renderRecordsTable();
            updateAllCharts(); // Update charts after editing
            editModal.hide();
            displayMessage(recordsMessage, '记录更新成功！', 'success');
        } else {
             alert('未找到要更新的记录！');
        }
    });

    // Delete Button Click (delegated listener set in renderRecordsTable)
    function handleDeleteClick(e) {
        const id = e.target.dataset.id;
        const record = drops.find(d => d.id === id);
        if (record && confirm(`确定要删除 ${record.date} 的 ${record.series} - ${record.part} 记录吗？`)) {
            drops = drops.filter(d => d.id !== id);
            saveData(LS_DROPS_KEY, drops);
            renderRecordsTable();
            updateAllCharts(); // Update charts after deleting
            displayMessage(recordsMessage, '记录删除成功！', 'success');
        }
    }

     // Import Button Click
    importBtn.addEventListener('click', () => {
        importFile.click(); // Trigger hidden file input
    });

    // Import File Input Change
    importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                // Basic validation
                if (typeof importedData === 'object' && importedData !== null &&
                    Array.isArray(importedData.drops) &&
                    Array.isArray(importedData.configSeries) &&
                    typeof importedData.configExpected === 'object' && importedData.configExpected !== null &&
                    importedData.drops.every(drop => typeof drop.runs === 'number')) //Check drops array
                {
                    // Ask user whether to replace or merge (simplest: replace)
                    if (confirm('导入的数据将覆盖现有所有记录和配置。确定要继续吗？')) {
                        drops = importedData.drops;
                        configSeries = importedData.configSeries;
                        configExpected = importedData.configExpected;

                        // Save imported data
                        saveData(LS_DROPS_KEY, drops);
                        saveData(LS_CONFIG_SERIES_KEY, configSeries);
                        saveData(LS_CONFIG_EXPECTED_KEY, configExpected);

                        // Full UI refresh
                        initializeUI();
                        displayMessage(recordsMessage, '数据导入成功！', 'success');
                    }
                } else {
                    throw new Error('JSON文件格式无效或缺少必要的键 (drops, configSeries, configExpected) 或 drops数组内的run属性不是number。');
                }
            } catch (error) {
                console.error("Import Error:", error);
                displayMessage(recordsMessage, `导入失败: ${error.message}`, 'danger');
            } finally {
                 // Reset file input to allow importing the same file again
                 importFile.value = null;
            }
        };
        reader.onerror = () => {
             displayMessage(recordsMessage, '读取文件时出错。', 'danger');
             importFile.value = null;
        };
        reader.readAsText(file);
    });

    // Export Button Click
    exportBtn.addEventListener('click', () => {
        if (drops.length === 0 && configSeries.length === 0 && Object.keys(configExpected).length === 0) {
             displayMessage(recordsMessage, '没有数据可以导出。', 'warning');
             return;
        }

        const dataToExport = {
            drops: drops,
            configSeries: configSeries,
            configExpected: configExpected
        };
        const jsonString = JSON.stringify(dataToExport, null, 2); // Pretty print JSON
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        a.download = `game_drops_backup_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
         displayMessage(recordsMessage, '数据已开始导出...', 'info');
    });


    // Config - Add Series
    addSeriesBtn.addEventListener('click', () => {
        const newSeriesName = newSeriesInput.value.trim();
        if (!newSeriesName) {
            displayMessage(configMessage, '系列名称不能为空！', 'warning');
            return;
        }
        if (configSeries.includes(newSeriesName)) {
            displayMessage(configMessage, `系列 "${newSeriesName}" 已存在！`, 'warning');
            return;
        }

        configSeries.push(newSeriesName);
        configSeries.sort(); // Keep series sorted alphabetically
        saveData(LS_CONFIG_SERIES_KEY, configSeries);

        // Update UI elements that depend on series list
        populateDropdowns();
        renderSeriesList();
        renderExpectedForm();
        updateAllCharts(); // Charts might change due to new series category
        newSeriesInput.value = '';
        displayMessage(configMessage, `系列 "${newSeriesName}" 添加成功！`, 'success');
    });

     // Config - Delete Series (delegated listener set in renderSeriesList)
    function handleDeleteSeriesClick(e) {
        const seriesToDelete = e.target.dataset.series;
        if (!seriesToDelete) return;

        if (confirm(`确定要删除系列 "${seriesToDelete}" 吗？\n注意：相关的期望配置也会被移除。已录入的该系列掉落数据将保留，但在部分图表中可能不再显示。`)) {
            configSeries = configSeries.filter(s => s !== seriesToDelete);
            saveData(LS_CONFIG_SERIES_KEY, configSeries);

            // Remove associated keys from configExpected
            let changedExpected = false;
             for (const part of PARTS) {
                 const key = getSeriesPartKey(seriesToDelete, part);
                 if (configExpected.hasOwnProperty(key)) {
                     delete configExpected[key];
                     changedExpected = true;
                 }
             }
             if(changedExpected) {
                 saveData(LS_CONFIG_EXPECTED_KEY, configExpected);
             }

            // Update UI
             populateDropdowns();
             renderSeriesList();
             renderExpectedForm();
             updateAllCharts();
             displayMessage(configMessage, `系列 "${seriesToDelete}" 已删除！`, 'success');
        }
    }

    // Config - Save Expected Distribution
    saveExpectedBtn.addEventListener('click', () => {
        const inputs = expectedDistTableContainer.querySelectorAll('.expected-input');
        const newExpected = {};
        let totalCount = 0;
        let isValid = true;

        inputs.forEach(input => {
            const series = input.dataset.series;
            const part = input.dataset.part;
            const value = parseInt(input.value, 10); // Use parseInt

            if (isNaN(value) || value < 0) {
                 displayMessage(configMessage, `系列 ${series} - 部位 ${part} 的期望数量必须是有效的非负整数！`, 'danger');
                 input.focus(); // Highlight the problematic input
                 isValid = false;
                 return; // Stop processing this input, maybe continue checking others? For now, stop all.
            }

             if (series && part) {
                 const key = getSeriesPartKey(series, part);
                 newExpected[key] = value;
                 totalCount += value;
             }
        });

        if (!isValid) return; // Stop if validation failed

        configExpected = newExpected;
        saveData(LS_CONFIG_EXPECTED_KEY, configExpected);

        // Re-render the form to show calculated percentages based on new totals
        renderExpectedForm();
        // Update charts that use expected values
        updateExpectedActualDistChart();
        updateTimeTrendCharts(); // Similarity depends on expected values

        displayMessage(configMessage, '期望掉落分布已保存！', 'success');
    });

    // Stack Toggle Change
    stackToggle.addEventListener('change', () => {
         // Only these two charts are affected by the toggle
         updateSeriesPartDistChart();
         updateExpectedActualDistChart();
    });

     // Window Resize Listener
     window.addEventListener('resize', handleResize);

    // Bootstrap Tab Change Listener (to resize charts when they become visible)
    const mainTabs = document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]');
    mainTabs.forEach(tabEl => {
        tabEl.addEventListener('shown.bs.tab', event => {
            // Check if the activated tab is the Statistics tab
            if (event.target.getAttribute('data-bs-target') === '#stats') {
                // Resize all charts within the stats tab
                ['seriesDistChart', 'partDistChart', 'seriesPartDistChart', 'expectedActualDistChart', 'countTrendChart', 'similarityTrendChart'].forEach(id => {
                     if (charts[id]) {
                         charts[id].resize();
                     }
                 });
            }
             // You could add similar logic for other tabs if they contained charts
        });
    });

    // --- Initialization ---
    const initializeUI = () => {
        entryDate.valueAsDate = new Date(); // Set default date to today
        populateDropdowns();
        renderRecordsTable();
        renderSeriesList();
        renderExpectedForm();
        initAllCharts(); // Initialize chart instances
        updateAllCharts(); // Render charts with data
    };

     const initAllCharts = () => {
        initChart('seriesDistChart');
        initChart('partDistChart');
        initChart('seriesPartDistChart');
        initChart('expectedActualDistChart');
        initChart('countTrendChart');
        initChart('similarityTrendChart');
    };

    const loadInitialData = () => {
        drops = loadData(LS_DROPS_KEY, []);
        configSeries = loadData(LS_CONFIG_SERIES_KEY, [...DEFAULT_SERIES]); // Use copy of default
        configExpected = loadData(LS_CONFIG_EXPECTED_KEY, {});

        // Ensure series are sorted initially
        configSeries.sort();
    };

    // --- Run on Load ---
    loadInitialData();
    initializeUI();

});