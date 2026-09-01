/**
 * app.js - Michael Doc (Document Management System)
 * ระบบจัดเก็บและบริหารหนังสือราชการ
 * พัฒนาปรับปรุง: เพิ่มความปลอดภัย (XSS Prevention), Toast & Modal Confirmations,
 * การตรวจสอบความถูกต้องของไฟล์, และการคำนวณปีงบประมาณไทย
 */

// ==========================================
// 1. การตั้งค่าระบบ (Configuration)
// ==========================================
const CONFIG = {
    APP_PASSWORD: '290539', // รหัสผ่านเข้าใช้งาน
    
    // ใส่ URL ที่ได้จากการ Deploy Google Apps Script เป็น Web App
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzuOjn2nHMK9AQxuSwpnBwBdbebpnhDnGLafC2BNRqRvNTWGBP8Dqh9a-89jUvLrnexTA/exec',
    
    // กำหนดขนาดไฟล์สูงสุดที่อนุญาต (10MB)
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024
};

// ==========================================
// 2. ตัวแปรสถานะระบบ (Global State)
// ==========================================
let currentView = 'dashboard'; // 'dashboard' หรือ 'table'
let categoryChartInstance = null;
let actionChartInstance = null;
let mockDatabase = []; // ฐานข้อมูลเอกสาร

// ==========================================
// 3. ฟังก์ชันตัวช่วย (Helper Utilities & Security)
// ==========================================

/**
 * ป้องกันช่องโหว่ XSS โดยการแปลงอักขระพิเศษเป็น HTML Entities
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * คำนวณปีงบประมาณไทย (พ.ศ.)
 * เกณฑ์ราชการ: เริ่มวันที่ 1 ตุลาคมของปีก่อนหน้า ถึง 30 กันยายนของปีปัจจุบัน
 */
function getCurrentFiscalYearBE() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1 - 12
    const yearBE = now.getFullYear() + 543;
    return month >= 10 ? yearBE + 1 : yearBE;
}

/**
 * ตรวจสอบความถูกต้องและขนาดของไฟล์ก่อนอัปโหลด
 */
function validateFile(file) {
    if (!file) return { valid: true };
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return {
            valid: false,
            message: `ไฟล์มีขนาด ${sizeMB}MB ซึ่งเกินกว่าที่ระบบกำหนด (สูงสุด 10MB)`
        };
    }
    return { valid: true };
}

/**
 * ระบบแจ้งเตือน Toast Notification แบบโมเดิร์น
 * @param {'success'|'error'|'warning'|'info'} type ประเภทการแจ้งเตือน
 * @param {string} title หัวข้อ
 * @param {string} message รายละเอียด
 * @param {number} duration ระยะเวลาแสดงผล (ms)
 */
function showToast(type = 'info', title = '', message = '', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-white border rounded-xl shadow-xl p-4 flex items-start space-x-3 transition-all duration-300 transform toast-animate-in';
    
    let iconClass = 'fa-circle-info text-blue-500';
    let borderColor = 'border-slate-200';
    
    if (type === 'success') {
        iconClass = 'fa-circle-check text-emerald-500';
        borderColor = 'border-emerald-200';
    } else if (type === 'error') {
        iconClass = 'fa-circle-xmark text-rose-500';
        borderColor = 'border-rose-200';
    } else if (type === 'warning') {
        iconClass = 'fa-triangle-exclamation text-amber-500';
        borderColor = 'border-amber-200';
    }

    toast.classList.add(borderColor);

    toast.innerHTML = `
        <div class="text-xl shrink-0 pt-0.5">
            <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="flex-1 min-w-0">
            ${title ? `<h4 class="text-sm font-bold text-slate-800 leading-tight">${escapeHtml(title)}</h4>` : ''}
            <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(message)}</p>
        </div>
        <button type="button" class="text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-1 -mt-1 shrink-0" aria-label="ปิดการแจ้งเตือน">
            <i class="fa-solid fa-xmark text-sm"></i>
        </button>
    `;

    const closeBtn = toast.querySelector('button');
    const removeToast = () => {
        toast.classList.remove('toast-animate-in');
        toast.classList.add('toast-animate-out');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 250);
    };

    closeBtn.addEventListener('click', removeToast);
    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(removeToast, duration);
    }
}

/**
 * ระบบหน้าต่างยืนยัน (Custom Confirm Modal) คืนค่าเป็น Promise<boolean>
 */
function showConfirm(title = 'ยืนยันการดำเนินการ', message = 'คุณแน่ใจหรือไม่ว่าต้องการดำเนินการนี้?') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const titleElem = document.getElementById('confirm-modal-title');
        const msgElem = document.getElementById('confirm-modal-message');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnOk = document.getElementById('btn-confirm-ok');

        titleElem.textContent = title;
        msgElem.textContent = message;

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);

        function cleanup(result) {
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                btnOk.removeEventListener('click', onOk);
                btnCancel.removeEventListener('click', onCancel);
                resolve(result);
            }, 250);
        }

        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}

// ==========================================
// 4. การจัดการ UI และ Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 4.1 ระบบ Login
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
            showToast('error', 'เข้าสู่ระบบไม่สำเร็จ', 'รหัสผ่านเข้าใช้งานไม่ถูกต้อง');
        }
    });

    function showMainApp() {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('hidden');
            document.body.classList.remove('hidden');
            appContainer.classList.remove('hidden');
            setTimeout(() => appContainer.classList.remove('opacity-0'), 50);
            
            // ดึงข้อมูลจากฐานข้อมูล
            fetchDatabase();
        }, 300);
    }

    // 4.2 Mobile Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const btnMenuToggle = document.getElementById('btn-menu-toggle');
    const btnCloseMenu = document.getElementById('btn-close-menu');

    function toggleSidebar() {
        sidebar.classList.toggle('-translate-x-full');
        sidebarOverlay.classList.toggle('hidden');
    }

    if (btnMenuToggle) btnMenuToggle.addEventListener('click', toggleSidebar);
    if (btnCloseMenu) btnCloseMenu.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // 4.3 การนำทาง (Navigation / Toggle View)
    const navItems = document.querySelectorAll('.nav-item');
    const viewTitle = document.getElementById('current-view-title');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => {
                nav.classList.remove('active', 'text-emerald-700', 'bg-emerald-50');
                nav.classList.add('text-slate-600');
            });
            e.currentTarget.classList.add('active', 'text-emerald-700', 'bg-emerald-50');
            e.currentTarget.classList.remove('text-slate-600');
            
            currentView = e.currentTarget.getAttribute('data-view');
            if (viewTitle) viewTitle.textContent = e.currentTarget.textContent.trim();
            
            if (window.innerWidth < 768) {
                toggleSidebar();
            }

            renderViews();
        });
    });

    // 4.4 Modal เพิ่ม/แก้ไข หนังสือ
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
            document.getElementById('docFiscalYear').value = getCurrentFiscalYearBE();
            fileInput.required = true;
            fileNameDisplay.textContent = '';
            fileNameDisplay.classList.add('hidden');
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
            editDocId.value = '';
            fileInput.value = '';
            fileNameDisplay.textContent = '';
            fileNameDisplay.classList.add('hidden');
        }, 300);
    }

    if (btnNewDoc) btnNewDoc.addEventListener('click', () => openModal(false));
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnCancelDoc) btnCancelDoc.addEventListener('click', closeModal);

    // Event ฟังก์ชัน Edit
    window.editDocument = function(id) {
        const doc = mockDatabase.find(d => String(d.id) === String(id));
        if (!doc) {
            showToast('error', 'ไม่พบข้อมูล', 'ไม่พบเอกสารที่ต้องการแก้ไขในระบบ');
            return;
        }
        
        openModal(true);
        
        editDocId.value = doc.id || '';
        document.getElementById('docCategory').value = doc.category || '01_หนังสือรับ';
        document.getElementById('docFiscalYear').value = doc.fiscalYear || getCurrentFiscalYearBE();
        document.getElementById('docNum').value = doc.docNum || '';
        document.getElementById('docDate').value = doc.date || '';
        document.getElementById('docTitle').value = doc.title || '';
        document.getElementById('docFrom').value = (doc.from === '-' ? '' : doc.from) || '';
        document.getElementById('docTo').value = (doc.to === '-' ? '' : doc.to) || '';
        document.getElementById('docAction').value = doc.action || 'เพื่อทราบ';
        document.getElementById('docTags').value = doc.tags || '';

        if (doc.driveFileId) {
            fileNameDisplay.textContent = '📎 มีไฟล์เดิมแนบอยู่แล้ว (เลือกไฟล์ใหม่หากต้องการเปลี่ยน)';
            fileNameDisplay.classList.remove('hidden');
        } else {
            fileNameDisplay.classList.add('hidden');
        }
    };

    // Event ฟังก์ชัน Delete
    window.deleteDocument = async function(id) {
        const confirmed = await showConfirm(
            'ยืนยันการลบเอกสาร',
            'คุณแน่ใจหรือไม่ว่าต้องการลบเอกสารนี้? เมื่อลบแล้วจะไม่สามารถกู้คืนข้อมูลได้'
        );

        if (confirmed) {
            showLoading(true, "กำลังลบข้อมูลออกจากระบบ...");
            try {
                const response = await callAppsScript({
                    action: 'delete',
                    payload: { id: id }
                });
                if (response.success) {
                    mockDatabase = Array.isArray(response.data) ? response.data : [];
                    renderViews();
                    showToast('success', 'ลบเอกสารสำเร็จ', 'ระบบได้นำเอกสารออกจากฐานข้อมูลแล้ว');
                } else {
                    throw new Error(response.message || 'ไม่สามารถลบเอกสารได้');
                }
            } catch (err) {
                showToast('error', 'เกิดข้อผิดพลาดในการลบ', err.message);
            } finally {
                showLoading(false);
            }
        }
    };

    // ตรวจสอบการเลือกไฟล์ผ่าน Input
    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const check = validateFile(file);
            if (!check.valid) {
                showToast('error', 'ขนาดไฟล์เกินกำหนด', check.message);
                this.value = '';
                fileNameDisplay.textContent = '';
                fileNameDisplay.classList.add('hidden');
                return;
            }
            fileNameDisplay.textContent = `ไฟล์ที่เลือก: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
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
                const check = validateFile(files[0]);
                if (!check.valid) {
                    showToast('error', 'ขนาดไฟล์เกินกำหนด', check.message);
                    return;
                }
                fileInput.files = files;
                fileInput.dispatchEvent(new Event('change'));
            }
        }, false);
    }

    // Submit Form (บันทึก / อัปเดตข้อมูล)
    addDocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formFiscalYear = document.getElementById('docFiscalYear').value.trim();
        const isEdit = editDocId.value !== '';
        const file = fileInput.files[0];

        // ตรวจสอบขนาดไฟล์
        if (file) {
            const check = validateFile(file);
            if (!check.valid) {
                showToast('error', 'ขนาดไฟล์เกินกำหนด', check.message);
                return;
            }
        }
        
        const docData = {
            docNum: document.getElementById('docNum').value.trim(),
            date: document.getElementById('docDate').value,
            title: document.getElementById('docTitle').value.trim(),
            from: document.getElementById('docFrom').value.trim() || '-',
            to: document.getElementById('docTo').value.trim() || '-',
            action: document.getElementById('docAction').value,
            tags: document.getElementById('docTags').value.trim(),
            category: document.getElementById('docCategory').value,
            fiscalYear: formFiscalYear,
        };

        const btnSave = document.getElementById('btn-save-doc');
        const originalText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
        btnSave.disabled = true;

        try {
            let fileBase64 = null;
            let mimeType = null;
            let fileName = null;
            if (file) {
                fileBase64 = await readFileAsBase64(file);
                mimeType = file.type || 'application/octet-stream';
                fileName = file.name;
            }

            if (isEdit) {
                docData.id = editDocId.value;
                const oldDoc = mockDatabase.find(d => String(d.id) === String(docData.id));
                if (oldDoc && !file) {
                    docData.driveFileId = oldDoc.driveFileId; // ใช้ไฟล์เดิม
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
                if (response.success) {
                    mockDatabase = Array.isArray(response.data) ? response.data : mockDatabase;
                    showToast('success', 'สำเร็จ', 'อัปเดตข้อมูลเอกสารเรียบร้อยแล้ว');
                }
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
                if (response.success) {
                    mockDatabase = Array.isArray(response.data) ? response.data : mockDatabase;
                    showToast('success', 'สำเร็จ', 'บันทึกหนังสือราชการใหม่เรียบร้อยแล้ว');
                }
            }
            
            closeModal();
            renderViews();
        } catch (error) {
            console.error(error);
            showToast('error', 'เกิดข้อผิดพลาดในการบันทึก', error.message);
        } finally {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
        }
    });

    // 4.5 ระบบสืบค้น (Search & Filters)
    const searchInput = document.getElementById('search-input');
    const btnAdvSearch = document.getElementById('btn-adv-search');
    const advSearchPopover = document.getElementById('adv-search-popover');
    const btnApplyFilters = document.getElementById('btn-apply-filters');
    const btnMobileSearch = document.getElementById('btn-mobile-search');
    const searchContainer = document.getElementById('search-container');
    const btnClearFilters = document.getElementById('btn-clear-filters');
    const btnExportCSV = document.getElementById('btn-export-csv');

    if (btnMobileSearch) {
        btnMobileSearch.addEventListener('click', () => {
            searchContainer.classList.toggle('hidden');
        });
    }

    if (btnAdvSearch) {
        btnAdvSearch.addEventListener('click', () => {
            advSearchPopover.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', (e) => {
        if (advSearchPopover && !advSearchPopover.contains(e.target) && btnAdvSearch && !btnAdvSearch.contains(e.target)) {
            advSearchPopover.classList.add('hidden');
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (currentView === 'dashboard') {
                const tableNav = document.querySelector('[data-view="table"]');
                if (tableNav) tableNav.click();
            } else {
                renderTable();
            }
        });
    }

    if (btnApplyFilters) {
        btnApplyFilters.addEventListener('click', () => {
            if (currentView === 'dashboard') {
                const tableNav = document.querySelector('[data-view="table"]');
                if (tableNav) tableNav.click();
            }
            renderTable(true);
            advSearchPopover.classList.add('hidden');
            
            if (window.innerWidth < 768 && searchContainer) {
                searchContainer.classList.add('hidden');
            }
        });
    }

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
            if (window.innerWidth < 768 && searchContainer) {
                searchContainer.classList.add('hidden');
            }
            showToast('info', 'ล้างตัวกรอง', 'แสดงผลรายการเอกสารทั้งหมด');
        });
    }

    // ส่งออกข้อมูลเป็นไฟล์ CSV (รองรับภาษาไทยสำหรับ Excel)
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            exportDocumentsToCSV();
        });
    }

    // ปลอดภัยด้วย Event Delegation บน Table Body
    const tableBody = document.getElementById('document-table-body');
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            const fileId = btn.getAttribute('data-file-id');

            if (action === 'open') {
                openDriveFile(fileId);
            } else if (action === 'edit') {
                window.editDocument(id);
            } else if (action === 'delete') {
                window.deleteDocument(id);
            }
        });
    }
});

// ==========================================
// 5. การ Render หน้าจอ (Dashboard & Table)
// ==========================================

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

// 5.1 Dashboard
function renderDashboard() {
    const yearData = mockDatabase;

    const totalDocs = yearData.length;
    const totalInbox = yearData.filter(d => (d.category || '').includes('หนังสือรับ')).length;
    const totalSent = yearData.filter(d => (d.category || '').includes('หนังสือส่ง')).length;
    const totalDone = yearData.filter(d => (d.action || '') === 'ดำเนินการแล้ว').length;

    document.getElementById('stat-total').textContent = totalDocs.toLocaleString();
    document.getElementById('stat-inbox').textContent = totalInbox.toLocaleString();
    document.getElementById('stat-sent').textContent = totalSent.toLocaleString();
    document.getElementById('stat-done').textContent = totalDone.toLocaleString();

    const categoriesCount = {};
    yearData.forEach(doc => {
        const cat = doc.category || '05_หนังสืออื่นๆ';
        categoriesCount[cat] = (categoriesCount[cat] || 0) + 1;
    });

    const categoryLabels = Object.keys(categoriesCount).map(c => c.replace(/^\d+_/, ''));
    const categoryData = Object.values(categoriesCount);

    const actionsCount = {};
    yearData.forEach(doc => {
        const act = doc.action || 'อื่นๆ';
        actionsCount[act] = (actionsCount[act] || 0) + 1;
    });
    
    const actionLabels = Object.keys(actionsCount);
    const actionData = Object.values(actionsCount);

    const categoryCanvas = document.getElementById('categoryChart');
    if (categoryCanvas) {
        const ctxCategory = categoryCanvas.getContext('2d');
        if (categoryChartInstance) categoryChartInstance.destroy();
        categoryChartInstance = new Chart(ctxCategory, {
            type: 'bar',
            data: {
                labels: categoryLabels,
                datasets: [{
                    label: 'จำนวนเอกสาร',
                    data: categoryData,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)', 
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    const actionCanvas = document.getElementById('actionChart');
    if (actionCanvas) {
        const ctxAction = actionCanvas.getContext('2d');
        if (actionChartInstance) actionChartInstance.destroy();
        actionChartInstance = new Chart(ctxAction, {
            type: 'doughnut',
            data: {
                labels: actionLabels,
                datasets: [{
                    data: actionData,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.75)',
                        'rgba(249, 115, 22, 0.75)',
                        'rgba(16, 185, 129, 0.75)',
                        'rgba(168, 85, 247, 0.75)',
                        'rgba(100, 116, 139, 0.75)'
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
    }

    // สรุปข้อมูลแยกตามปีงบประมาณ
    const fiscalYearsCount = {};
    mockDatabase.forEach(doc => {
        if (doc.fiscalYear) {
            const yr = String(doc.fiscalYear);
            fiscalYearsCount[yr] = (fiscalYearsCount[yr] || 0) + 1;
        }
    });

    const sortedYears = Object.keys(fiscalYearsCount).sort((a, b) => b - a);
    const currentFiscalYearBE = getCurrentFiscalYearBE().toString();
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
                const isCurrentYear = year === currentFiscalYearBE;
                
                const card = document.createElement('div');
                if (isCurrentYear) {
                    card.className = "bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4 flex flex-col justify-between relative shadow-sm transition-all hover:shadow-md";
                    card.innerHTML = `
                        <div class="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ปีงบประมาณปัจจุบัน
                        </div>
                        <span class="text-xs font-bold text-emerald-800"><i class="fa-solid fa-calendar-day mr-1"></i> ปีงบประมาณ พ.ศ. ${escapeHtml(year)}</span>
                        <span class="text-2xl font-black text-emerald-950 mt-2 font-inter">${count.toLocaleString()} <span class="text-xs font-normal text-emerald-700">เล่ม</span></span>
                    `;
                } else {
                    card.className = "bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between transition-all hover:shadow-sm";
                    card.innerHTML = `
                        <span class="text-xs font-semibold text-slate-500"><i class="fa-regular fa-calendar mr-1"></i> ปีงบประมาณ พ.ศ. ${escapeHtml(year)}</span>
                        <span class="text-2xl font-bold text-slate-800 mt-2 font-inter">${count.toLocaleString()} <span class="text-xs font-normal text-slate-500">เล่ม</span></span>
                    `;
                }
                breakdownContainer.appendChild(card);
            });
        }
    }
}

// 5.2 Table
function renderTable(useAdvanced = false) {
    const tbody = document.getElementById('document-table-body');
    const emptyState = document.getElementById('empty-state');
    const countBadge = document.getElementById('doc-count-badge');
    
    tbody.innerHTML = '';
    
    let filteredData = [...mockDatabase];
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    if (useAdvanced) {
        const fDocNum = (document.getElementById('filter-doc-num').value || '').trim().toLowerCase();
        const fCategory = document.getElementById('filter-category').value;
        const fFiscalYear = (document.getElementById('filter-fiscal-year').value || '').trim();
        const fStart = document.getElementById('filter-date-start').value;
        const fEnd = document.getElementById('filter-date-end').value;
 
        filteredData = filteredData.filter(doc => {
            let match = true;
            const dNum = (doc.docNum || '').toLowerCase();
            const dCat = doc.category || '';
            const dYear = String(doc.fiscalYear || '').trim();
            const dDate = doc.date || '';

            if (fDocNum && !dNum.includes(fDocNum)) match = false;
            if (fCategory && dCat !== fCategory) match = false;
            if (fFiscalYear && dYear !== fFiscalYear) match = false;
            if (fStart && dDate < fStart) match = false;
            if (fEnd && dDate > fEnd) match = false;
            return match;
        });
    } else if (searchTerm) {
        filteredData = filteredData.filter(doc => {
            const dNum = (doc.docNum || '').toLowerCase();
            const dTitle = (doc.title || '').toLowerCase();
            const dTags = (doc.tags || '').toLowerCase();
            const dCat = (doc.category || '').toLowerCase();
            const dYear = String(doc.fiscalYear || '').toLowerCase();
            const dFrom = (doc.from || '').toLowerCase();
            const dTo = (doc.to || '').toLowerCase();

            return dNum.includes(searchTerm) || 
                   dTitle.includes(searchTerm) ||
                   dTags.includes(searchTerm) ||
                   dCat.includes(searchTerm) ||
                   dYear.includes(searchTerm) ||
                   dFrom.includes(searchTerm) ||
                   dTo.includes(searchTerm);
        });
    }

    // เรียงลำดับจากวันที่ล่าสุด
    filteredData.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
    });

    if (countBadge) {
        countBadge.textContent = `${filteredData.length.toLocaleString()} รายการ`;
    }

    if (filteredData.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        
        filteredData.forEach(doc => {
            let thaiDate = '-';
            if (doc.date) {
                const dateObj = new Date(doc.date);
                if (!isNaN(dateObj.getTime())) {
                    thaiDate = dateObj.toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            }

            let actionColor = 'bg-slate-100 text-slate-800';
            if (doc.action === 'เพื่อทราบ') actionColor = 'bg-blue-100 text-blue-800';
            else if (doc.action === 'เพื่อพิจารณา') actionColor = 'bg-orange-100 text-orange-800';
            else if (doc.action === 'ดำเนินการแล้ว') actionColor = 'bg-emerald-100 text-emerald-800';
            else if (doc.action === 'เวียนแจ้ง') actionColor = 'bg-purple-100 text-purple-800';

            const categoryClean = (doc.category || '').replace(/^\d+_/, '');
            const safeId = escapeHtml(doc.id || '');
            const safeFileId = escapeHtml(doc.driveFileId || '');

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors group';
            tr.innerHTML = `
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                    <span class="bg-slate-100 px-2 py-1 rounded">${escapeHtml(categoryClean)}</span>
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 text-sm font-bold text-emerald-700 font-inter">${escapeHtml(doc.docNum)}</td>
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-slate-500">${escapeHtml(thaiDate)}</td>
                <td class="px-4 py-3 md:px-6 md:py-4 text-sm text-slate-800 font-medium">
                    <div>${escapeHtml(doc.title)}</div>
                    ${doc.tags ? `<div class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-tag text-[10px] mr-1"></i>${escapeHtml(doc.tags)}</div>` : ''}
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 text-sm text-slate-500">
                    <div class="flex flex-col text-xs space-y-1">
                        <span class="text-slate-600 truncate max-w-[150px]" title="${escapeHtml(doc.from)}"><i class="fa-solid fa-arrow-right-from-bracket text-[10px] mr-1 w-3 text-emerald-400"></i> ${escapeHtml(doc.from)}</span>
                        <span class="text-slate-600 truncate max-w-[150px]" title="${escapeHtml(doc.to)}"><i class="fa-solid fa-arrow-right-to-bracket text-[10px] mr-1 w-3 text-emerald-500"></i> ${escapeHtml(doc.to)}</span>
                    </div>
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-sm text-slate-500">
                    <span class="px-2.5 py-1 inline-flex text-xs font-medium rounded-full ${actionColor}">${escapeHtml(doc.action)}</span>
                </td>
                <td class="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-slate-50 group-hover:bg-slate-100 transition-colors border-l border-slate-100">
                    <div class="flex justify-center space-x-1.5">
                        <button type="button" data-action="open" data-file-id="${safeFileId}" class="text-emerald-600 hover:text-emerald-900 bg-emerald-100/60 p-2 rounded-lg hover:bg-emerald-200 transition-colors" title="เปิดดูเอกสาร" aria-label="เปิดดูเอกสาร">
                            <i class="fa-solid fa-arrow-up-right-from-square pointer-events-none"></i>
                        </button>
                        <button type="button" data-action="edit" data-id="${safeId}" class="text-amber-600 hover:text-amber-800 bg-amber-100/60 p-2 rounded-lg hover:bg-amber-200 transition-colors" title="แก้ไขเอกสาร" aria-label="แก้ไขเอกสาร">
                            <i class="fa-solid fa-pen pointer-events-none"></i>
                        </button>
                        <button type="button" data-action="delete" data-id="${safeId}" class="text-rose-600 hover:text-rose-800 bg-rose-100/60 p-2 rounded-lg hover:bg-rose-200 transition-colors" title="ลบเอกสาร" aria-label="ลบเอกสาร">
                            <i class="fa-solid fa-trash-can pointer-events-none"></i>
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
        showToast('warning', 'ไม่มีไฟล์แนบ', 'เอกสารรายการนี้ยังไม่ได้แนบไฟล์ในระบบ');
        return;
    }
    const url = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * ส่งออกเอกสารเป็น CSV (พร้อม UTF-8 BOM สำหรับ Excel ภาษาไทย)
 */
function exportDocumentsToCSV() {
    if (!mockDatabase || mockDatabase.length === 0) {
        showToast('warning', 'ไม่มีข้อมูล', 'ยังไม่มีรายการเอกสารในระบบสำหรับส่งออก');
        return;
    }

    const headers = ['หมวดหมู่', 'เลขที่หนังสือ', 'ลงวันที่', 'เรื่อง', 'จาก', 'ถึง', 'การปฏิบัติ', 'คำสำคัญ', 'ปีงบประมาณ', 'Google Drive File ID'];
    const rows = mockDatabase.map(d => [
        `"${(d.category || '').replace(/"/g, '""')}"`,
        `"${(d.docNum || '').replace(/"/g, '""')}"`,
        `"${(d.date || '').replace(/"/g, '""')}"`,
        `"${(d.title || '').replace(/"/g, '""')}"`,
        `"${(d.from || '').replace(/"/g, '""')}"`,
        `"${(d.to || '').replace(/"/g, '""')}"`,
        `"${(d.action || '').replace(/"/g, '""')}"`,
        `"${(d.tags || '').replace(/"/g, '""')}"`,
        `"${(d.fiscalYear || '').toString().replace(/"/g, '""')}"`,
        `"${(d.driveFileId || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `MichaelDoc_Export_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('success', 'ส่งออกสำเร็จ', 'ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
}

// ==========================================
// 6. Backend API Integration (Google Apps Script)
// ==========================================

function updateApiStatus(connected, message) {
    const apiIcon = document.getElementById('api-icon');
    const apiStatus = document.getElementById('api-status');
    
    if (!apiIcon || !apiStatus) return;

    if (connected) {
        apiIcon.className = 'fa-solid fa-server text-emerald-500 mr-2';
        apiStatus.textContent = 'เชื่อมต่อฐานข้อมูลสำเร็จ';
    } else {
        apiIcon.className = 'fa-solid fa-server text-rose-500 mr-2';
        apiStatus.textContent = message || 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้';
    }
}

function showLoading(show, text = "กำลังโหลดข้อมูล...") {
    const loadingState = document.getElementById('loading-state');
    if (!loadingState) return;

    const loadingText = loadingState.querySelector('p');
    if (show) {
        if (loadingText) loadingText.textContent = text;
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
        throw new Error(`การเชื่อมต่อเซิร์ฟเวอร์ล้มเหลว (HTTP ${response.status})`);
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
            showToast('info', 'โหลดข้อมูลเรียบร้อย', `พร้อมใช้งานเอกสารจำนวน ${mockDatabase.length} รายการ`, 2500);
        } else {
            mockDatabase = [];
            updateApiStatus(false, "รอตั้งค่า APPS_SCRIPT_URL");
            showToast('warning', 'รอการตั้งค่า', 'กรุณานำ Web App URL ที่ได้จาก Google Apps Script มาตั้งค่าในไฟล์ app.js');
        }
    } catch (err) {
        console.error("Fetch DB error:", err);
        updateApiStatus(false, "เชื่อมต่อขัดข้อง");
        mockDatabase = [];
        showToast('error', 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ', err.message);
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
