/**
 * app.js - Michael Doc (Document Management System)
 * Logic สำหรับควบคุม UI, Simple Login Barrier, Google Apps Script Backend และ Chart.js
 */

// ==========================================
// 1. การตั้งค่าระบบ (Configuration)
// ==========================================
const CONFIG = {
    APP_PASSWORD: '290539', // รหัสผ่านเข้าใช้งาน 
    
    // ใส่ URL ที่ได้จากการ Deploy Google Apps Script เป็น Web App
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzuOjn2nHMK9AQxuSwpnBwBdbebpnhDnGLafC2BNRqRvNTWGBP8Dqh9a-89jUvLrnexTA/exec'
};

// ==========================================
// 2. ตัวแปรสถานะระบบ (State)
// ==========================================
let currentView = 'dashboard'; // 'dashboard' or 'table'
let currentFiscalYear = '2569'; // ปีงบประมาณปัจจุบัน (Global State)

// ตัวแปรสำหรับเก็บ Instance ของ Chart
let categoryChartInstance = null;
let actionChartInstance = null;

// ฐานข้อมูล (จะถูกดึงมาจาก Google Apps Script)
let mockDatabase = [];

// ==========================================
// 3. การจัดการ UI และ Login Barrier
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 3.1 ระบบ Login พื้นฐาน
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');

    if (sessionStorage.getItem('docgov_auth') === 'true') {
        showMainApp();
    } else {
        document.body.classList.remove('hidden'); 
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (passwordInput.value === CONFIG.APP_PASSWORD) {
            sessionStorage.setItem('docgov_auth', 'true');
            showMainApp();
        } else {
            loginError.classList.remove('hidden');
            passwordInput.classList.add('border-red-500');
        }
    });

    function showMainApp() {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('hidden');
            document.body.classList.remove('hidden');
            appContainer.classList.remove('hidden');
            setTimeout(() => appContainer.classList.remove('opacity-0'), 50);
            
            // โหลดข้อมูลจาก Google Apps Script
            fetchDatabase();
        }, 300);
    }

    // 3.2 Mobile Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const btnMenuToggle = document.getElementById('btn-menu-toggle');
    const btnCloseMenu = document.getElementById('btn-close-menu');

    function toggleSidebar() {
        sidebar.classList.toggle('-translate-x-full');
        sidebarOverlay.classList.toggle('hidden');
    }

    btnMenuToggle.addEventListener('click', toggleSidebar);
    btnCloseMenu.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    // 3.3 การนำทาง (Navigation / Toggle View)
    const navItems = document.querySelectorAll('.nav-item');
    const viewTitle = document.getElementById('current-view-title');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // จัดการคลาส Active ของ Sidebar
            navItems.forEach(nav => {
                nav.classList.remove('active', 'text-emerald-700', 'bg-emerald-50');
                nav.classList.add('text-slate-600');
            });
            e.currentTarget.classList.add('active', 'text-emerald-700', 'bg-emerald-50');
            e.currentTarget.classList.remove('text-slate-600');
            
            currentView = e.currentTarget.getAttribute('data-view');
            viewTitle.textContent = e.currentTarget.textContent.trim();
            
            // ปิด sidebar บนมือถือเมื่อคลิกเมนู
            if (window.innerWidth < 768) {
                toggleSidebar();
            }

            // สลับหน้าจอ
            renderViews();
        });
    });

    // 3.4 ปีงบประมาณหลัก (Global Fiscal Year) - Removed

    // 3.5 Modal เพิ่ม/แก้ไข หนังสือ
    const modalAddDoc = document.getElementById('modal-add-doc');
    const btnNewDoc = document.getElementById('btn-new-doc');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelDoc = document.getElementById('btn-cancel-doc');
    const addDocForm = document.getElementById('add-doc-form');
    const fileInput = document.getElementById('docFile');
    const fileNameDisplay = document.getElementById('file-name-display');
    const modalTitle = document.getElementById('modal-title');
    const editDocId = document.getElementById('editDocId');

    function openModal(isEdit = false) {
        if (!isEdit) {
            addDocForm.reset();
            editDocId.value = '';
            modalTitle.textContent = 'เพิ่มหนังสือราชการใหม่';
            document.getElementById('docFiscalYear').value = new Date().getFullYear() + 543;
            fileInput.required = true;
        } else {
            modalTitle.textContent = 'แก้ไขหนังสือราชการ';
            fileInput.required = false;
        }

        modalAddDoc.classList.remove('hidden');
        setTimeout(() => {
            modalAddDoc.classList.remove('opacity-0');
            modalAddDoc.querySelector('div').classList.remove('scale-95');
        }, 10);
    }

    function closeModal() {
        modalAddDoc.classList.add('opacity-0');
        modalAddDoc.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modalAddDoc.classList.add('hidden');
            addDocForm.reset();
            fileNameDisplay.classList.add('hidden');
        }, 300);
    }

    // ฟังก์ชัน Edit (ดึงมาให้ Global เรียกใช้จากปุ่มในตารางได้)
    window.editDocument = function(id) {
        const doc = mockDatabase.find(d => d.id === id);
        if (!doc) return;
        
        openModal(true);
        
        editDocId.value = doc.id;
        document.getElementById('docCategory').value = doc.category;
        document.getElementById('docFiscalYear').value = doc.fiscalYear;
        document.getElementById('docNum').value = doc.docNum;
        document.getElementById('docDate').value = doc.date;
        document.getElementById('docTitle').value = doc.title;
        document.getElementById('docFrom').value = doc.from === '-' ? '' : doc.from;
        document.getElementById('docTo').value = doc.to === '-' ? '' : doc.to;
        document.getElementById('docAction').value = doc.action;
        document.getElementById('docTags').value = doc.tags;
    };

    // ฟังก์ชัน Delete (ดึงมาให้ Global เรียกใช้จากปุ่มในตารางได้)
    window.deleteDocument = async function(id) {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบเอกสารนี้? ข้อมูลจะไม่สามารถกู้คืนได้')) {
            showLoading(true, "กำลังลบข้อมูล...");
            try {
                const response = await callAppsScript({
                    action: 'delete',
                    payload: { id: id }
                });
                if (response.success) {
                    mockDatabase = response.data;
                    renderViews();
                    alert('ลบเอกสารเรียบร้อยแล้ว');
                }
            } catch (err) {
                alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message);
            } finally {
                showLoading(false);
            }
        }
    };

    btnNewDoc.addEventListener('click', () => openModal(false));
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelDoc.addEventListener('click', closeModal);

    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            fileNameDisplay.textContent = `ไฟล์ที่เลือก: ${this.files[0].name}`;
            fileNameDisplay.classList.remove('hidden');
        } else {
            fileNameDisplay.classList.add('hidden');
        }
    });

    // ระบบ Drag and Drop สำหรับการอัปโหลดไฟล์
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('hover:border-emerald-500', 'hover:bg-emerald-50/50');
                dropZone.classList.add('border-emerald-500', 'bg-emerald-50/50');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('border-emerald-500', 'bg-emerald-50/50');
                dropZone.classList.add('hover:border-emerald-500', 'hover:bg-emerald-50/50');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files && files.length > 0) {
                fileInput.files = files;
                fileInput.dispatchEvent(new Event('change'));
            }
        }, false);
    }

    addDocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formFiscalYear = document.getElementById('docFiscalYear').value;
        const isEdit = editDocId.value !== '';
        
        const docData = {
            docNum: document.getElementById('docNum').value,
            date: document.getElementById('docDate').value,
            title: document.getElementById('docTitle').value,
            from: document.getElementById('docFrom').value || '-',
            to: document.getElementById('docTo').value || '-',
            action: document.getElementById('docAction').value,
            tags: document.getElementById('docTags').value,
            category: document.getElementById('docCategory').value,
            fiscalYear: formFiscalYear,
        };

        const file = fileInput.files[0];
        const btnSave = document.getElementById('btn-save-doc');
        const originalText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
        btnSave.disabled = true;

        try {
            // อ่านไฟล์เป็น Base64
            let fileBase64 = null;
            let mimeType = null;
            let fileName = null;
            if (file) {
                const base64Str = await readFileAsBase64(file);
                fileBase64 = base64Str;
                mimeType = file.type;
                fileName = file.name;
            }

            if (isEdit) {
                docData.id = editDocId.value;
                const oldDoc = mockDatabase.find(d => d.id === docData.id);
                if (oldDoc && !file) {
                    docData.driveFileId = oldDoc.driveFileId; // เก็บไฟล์เดิมไว้
                }
                
                const response = await callAppsScript({
                    action: 'update',
                    payload: {
                        document: docData,
                        fileData: fileBase64,
                        mimeType: mimeType,
                        fileName: fileName
                    }
                });
                if (response.success) mockDatabase = response.data;
            } else {
                docData.id = 'doc-' + Date.now();
                const response = await callAppsScript({
                    action: 'create',
                    payload: {
                        document: docData,
                        fileData: fileBase64,
                        mimeType: mimeType,
                        fileName: fileName
                    }
                });
                if (response.success) mockDatabase = response.data;
            }
            
            closeModal();
            renderViews();
            alert(isEdit ? 'อัปเดตข้อมูลเรียบร้อยแล้ว' : 'บันทึกเอกสารเรียบร้อยแล้ว');
        } catch (error) {
            console.error(error);
            alert('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
        } finally {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
        }
    });

    // 3.6 ระบบสืบค้น (Search & Filters)
    const searchInput = document.getElementById('search-input');
    const btnAdvSearch = document.getElementById('btn-adv-search');
    const advSearchPopover = document.getElementById('adv-search-popover');
    const btnApplyFilters = document.getElementById('btn-apply-filters');
    const btnMobileSearch = document.getElementById('btn-mobile-search');
    const searchContainer = document.getElementById('search-container');

    if(btnMobileSearch) {
        btnMobileSearch.addEventListener('click', () => {
            searchContainer.classList.toggle('hidden');
        });
    }

    btnAdvSearch.addEventListener('click', () => {
        advSearchPopover.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!advSearchPopover.contains(e.target) && e.target !== btnAdvSearch) {
            advSearchPopover.classList.add('hidden');
        }
    });

    searchInput.addEventListener('input', () => {
        if(currentView === 'dashboard') {
            document.querySelector('[data-view="table"]').click();
        } else {
            renderTable();
        }
    });

    btnApplyFilters.addEventListener('click', () => {
        if(currentView === 'dashboard') {
            document.querySelector('[data-view="table"]').click();
        }
        renderTable(true);
        advSearchPopover.classList.add('hidden');
        
        if(window.innerWidth < 768) {
            searchContainer.classList.add('hidden');
        }
    });

    const btnClearFilters = document.getElementById('btn-clear-filters');
    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', () => {
            document.getElementById('filter-doc-num').value = '';
            document.getElementById('filter-category').value = '';
            document.getElementById('filter-fiscal-year').value = '';
            document.getElementById('filter-date-start').value = '';
            document.getElementById('filter-date-end').value = '';
            document.getElementById('search-input').value = '';
            renderTable();
            advSearchPopover.classList.add('hidden');
            if (window.innerWidth < 768) {
                searchContainer.classList.add('hidden');
            }
        });
    }
});
function renderViews() {
    const dashboardView = document.getElementById('dashboard-view');
    const tableView = document.getElementById('table-view');

    if (currentView === 'dashboard') {
        dashboardView.classList.remove('hidden');
        tableView.classList.add('hidden');
        renderDashboard();
    } else {
        dashboardView.classList.add('hidden');
        tableView.classList.remove('hidden');
        renderTable();
    }
}

// 4.1 Dashboard
function renderDashboard() {
    const yearData = mockDatabase;

    const totalDocs = yearData.length;
    const totalInbox = yearData.filter(d => d.category === '01_หนังสือรับ').length;
    const totalSent = yearData.filter(d => d.category === '02_หนังสือส่ง').length;
    const totalDone = yearData.filter(d => d.action === 'ดำเนินการแล้ว').length;

    document.getElementById('stat-total').textContent = totalDocs;
    document.getElementById('stat-inbox').textContent = totalInbox;
    document.getElementById('stat-sent').textContent = totalSent;
    document.getElementById('stat-done').textContent = totalDone;

    const categoriesCount = {};
    yearData.forEach(doc => {
        categoriesCount[doc.category] = (categoriesCount[doc.category] || 0) + 1;
    });

    const categoryLabels = Object.keys(categoriesCount).map(c => c.replace(/^\d+_/, ''));
    const categoryData = Object.values(categoriesCount);

    const actionsCount = {};
    yearData.forEach(doc => {
        actionsCount[doc.action] = (actionsCount[doc.action] || 0) + 1;
    });
    
    const actionLabels = Object.keys(actionsCount);
    const actionData = Object.values(actionsCount);

    const ctxCategory = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(ctxCategory, {
        type: 'bar',
        data: {
            labels: categoryLabels,
            datasets: [{
                label: 'จำนวนเอกสาร',
                data: categoryData,
                backgroundColor: 'rgba(16, 185, 129, 0.7)', 
                borderColor: 'rgb(16, 185, 129)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });

    const ctxAction = document.getElementById('actionChart').getContext('2d');
    if (actionChartInstance) actionChartInstance.destroy();
    actionChartInstance = new Chart(ctxAction, {
        type: 'doughnut',
        data: {
            labels: actionLabels,
            datasets: [{
                data: actionData,
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(168, 85, 247, 0.7)',
                    'rgba(100, 116, 139, 0.7)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });

    // 4. สรุปข้อมูลแยกตามปีงบประมาณ
    const fiscalYearsCount = {};
    mockDatabase.forEach(doc => {
        if (doc.fiscalYear) {
            fiscalYearsCount[doc.fiscalYear] = (fiscalYearsCount[doc.fiscalYear] || 0) + 1;
        }
    });

    const sortedYears = Object.keys(fiscalYearsCount).sort((a, b) => b - a);
    const currentCalendarYearBE = (new Date().getFullYear() + 543).toString();
    const breakdownContainer = document.getElementById('fiscal-year-breakdown');
    
    if (breakdownContainer) {
        breakdownContainer.innerHTML = '';
        if (sortedYears.length === 0) {
            breakdownContainer.innerHTML = `
                <div class="col-span-full text-center py-6 text-slate-400">
                    <i class="fa-regular fa-calendar-xmark text-xl mb-1 block"></i>
                    ยังไม่มีข้อมูลปีงบประมาณ
                </div>
            `;
        } else {
            sortedYears.forEach(year => {
                const count = fiscalYearsCount[year];
                const isCurrentYear = year === currentCalendarYearBE;
                
                const card = document.createElement('div');
                if (isCurrentYear) {
                    card.className = "bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4 flex flex-col justify-between relative shadow-sm transition-all hover:shadow-md";
                    card.innerHTML = `
                        <div class="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ปีปัจจุบัน
                        </div>
                        <span class="text-xs font-bold text-emerald-800"><i class="fa-solid fa-calendar-day mr-1"></i> ปีงบประมาณ พ.ศ. ${year}</span>
                        <span class="text-2xl font-black text-emerald-950 mt-2 font-inter">${count} <span class="text-xs font-normal text-emerald-700">เล่ม</span></span>
                    `;
                } else {
                    card.className = "bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between transition-all hover:shadow-sm";
                    card.innerHTML = `
                        <span class="text-xs font-semibold text-slate-500"><i class="fa-regular fa-calendar mr-1"></i> ปีงบประมาณ พ.ศ. ${year}</span>
                        <span class="text-2xl font-bold text-slate-800 mt-2 font-inter">${count} <span class="text-xs font-normal text-slate-500">เล่ม</span></span>
                    `;
                }
                breakdownContainer.appendChild(card);
            });
        }
    }
}

// 4.2 Table
function renderTable(useAdvanced = false) {
    const tbody = document.getElementById('document-table-body');
    const emptyState = document.getElementById('empty-state');
    
    tbody.innerHTML = '';
    
    let filteredData = [...mockDatabase];
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    if (useAdvanced) {
        const fDocNum = document.getElementById('filter-doc-num').value.toLowerCase();
        const fCategory = document.getElementById('filter-category').value;
        const fFiscalYear = document.getElementById('filter-fiscal-year').value.trim();
        const fStart = document.getElementById('filter-date-start').value;
        const fEnd = document.getElementById('filter-date-end').value;
 
        filteredData = filteredData.filter(doc => {
            let match = true;
            if (fDocNum && !doc.docNum.toLowerCase().includes(fDocNum)) match = false;
            if (fCategory && doc.category !== fCategory) match = false;
            if (fFiscalYear && doc.fiscalYear.toString() !== fFiscalYear) match = false;
            if (fStart && doc.date < fStart) match = false;
            if (fEnd && doc.date > fEnd) match = false;
            return match;
        });
    } else if (searchTerm) {
        filteredData = filteredData.filter(doc => 
            doc.docNum.toLowerCase().includes(searchTerm) || 
            doc.title.toLowerCase().includes(searchTerm) ||
            doc.tags.toLowerCase().includes(searchTerm) ||
            doc.category.toLowerCase().includes(searchTerm) ||
            (doc.fiscalYear && doc.fiscalYear.toString().includes(searchTerm))
        );
    }

    filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredData.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        
        filteredData.forEach(doc => {
            const dateObj = new Date(doc.date);
            const thaiDate = dateObj.toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            let actionColor = 'bg-slate-100 text-slate-800';
            if (doc.action === 'เพื่อทราบ') actionColor = 'bg-blue-100 text-blue-800';
            else if (doc.action === 'เพื่อพิจารณา') actionColor = 'bg-orange-100 text-orange-800';
            else if (doc.action === 'ดำเนินการแล้ว') actionColor = 'bg-emerald-100 text-emerald-800';
            else if (doc.action === 'เวียนแจ้ง') actionColor = 'bg-purple-100 text-purple-800';

            const categoryClean = doc.category.replace(/^\d+_/, '');

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors group';
            tr.innerHTML = `
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                    <span class="bg-slate-100 px-2 py-1 rounded">${categoryClean}</span>
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 text-sm font-bold text-emerald-700">${doc.docNum}</td>
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-slate-500">${thaiDate}</td>
                <td class="px-4 py-3 md:px-6 md:py-4 text-sm text-slate-800 font-medium">
                    ${doc.title}
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 text-sm text-slate-500">
                    <div class="flex flex-col text-xs space-y-1">
                        <span class="text-slate-600 truncate max-w-[150px]" title="${doc.from}"><i class="fa-solid fa-arrow-right-from-bracket text-[10px] mr-1 w-3 text-emerald-400"></i> ${doc.from}</span>
                        <span class="text-slate-600 truncate max-w-[150px]" title="${doc.to}"><i class="fa-solid fa-arrow-right-to-bracket text-[10px] mr-1 w-3 text-emerald-500"></i> ${doc.to}</span>
                    </div>
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-slate-500">
                    <span class="px-2.5 py-1 inline-flex text-xs font-medium rounded-full ${actionColor}">${doc.action}</span>
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-slate-50 group-hover:bg-slate-100 transition-colors border-l border-slate-100">
                    <div class="flex justify-center space-x-1.5">
                        <button onclick="openDriveFile('${doc.driveFileId}')" class="text-emerald-600 hover:text-emerald-900 bg-emerald-100/50 p-2 rounded-lg hover:bg-emerald-200 transition-colors" title="เปิดดูเอกสาร">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                        <button onclick="editDocument('${doc.id}')" class="text-amber-500 hover:text-amber-700 bg-amber-50 p-2 rounded-lg hover:bg-amber-100 transition-colors" title="แก้ไขเอกสาร">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="deleteDocument('${doc.id}')" class="text-rose-500 hover:text-rose-700 bg-rose-50 p-2 rounded-lg hover:bg-rose-100 transition-colors" title="ลบเอกสาร">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function openDriveFile(fileId) {
    if (!fileId) {
        alert('เอกสารนี้ไม่มีไฟล์แนบ');
        return;
    }
    const url = `https://drive.google.com/file/d/${fileId}/view`;
    window.open(url, '_blank');
}

// ==========================================
// 5. Backend API Integration (Google Apps Script)
// ==========================================

function updateApiStatus(connected, message) {
    const apiIcon = document.getElementById('api-icon');
    const apiStatus = document.getElementById('api-status');
    
    if (connected) {
        apiIcon.className = 'fa-solid fa-server text-emerald-500 mr-2';
        apiStatus.textContent = 'เชื่อมต่อฐานข้อมูลสำเร็จ';
    } else {
        apiIcon.className = 'fa-solid fa-server text-rose-500 mr-2';
        apiStatus.textContent = message || 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้';
    }
}

function showLoading(show, text="กำลังโหลดข้อมูล...") {
    const loadingState = document.getElementById('loading-state');
    const loadingText = loadingState.querySelector('p');
    if (show) {
        loadingText.textContent = text;
        loadingState.classList.remove('hidden');
    } else {
        loadingState.classList.add('hidden');
    }
}

async function callAppsScript(data) {
    if (CONFIG.APPS_SCRIPT_URL === 'YOUR_WEB_APP_URL') {
        throw new Error("คุณยังไม่ได้ใส่ APPS_SCRIPT_URL ในไฟล์ app.js");
    }
    
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        throw new Error("Network response was not ok");
    }
    
    const json = await response.json();
    if (json.error) {
        throw new Error(json.error);
    }
    
    return json;
}

async function fetchDatabase() {
    showLoading(true, "กำลังโหลดข้อมูลเอกสาร...");
    try {
        if (CONFIG.APPS_SCRIPT_URL !== 'YOUR_WEB_APP_URL') {
            const dbData = await callAppsScript({ action: 'read' });
            mockDatabase = Array.isArray(dbData) ? dbData : [];
            updateApiStatus(true);
        } else {
            // โหมดแจ้งเตือนสำหรับผู้ใช้ที่ยังไม่ตั้งค่า
            mockDatabase = [];
            updateApiStatus(false, "รอตั้งค่า APPS_SCRIPT_URL");
            alert("กรุณานำ Web App URL ที่ได้จาก Google Apps Script มาตั้งค่าในไฟล์ app.js เพื่อเริ่มใช้งานฐานข้อมูล");
        }
    } catch (err) {
        console.error("Fetch DB error:", err);
        updateApiStatus(false, "เชื่อมต่อขัดข้อง");
        mockDatabase = [];
    } finally {
        renderViews();
        showLoading(false);
    }
}

// Helper: อ่านไฟล์เป็น Base64 String
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}
