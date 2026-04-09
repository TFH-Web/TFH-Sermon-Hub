declare function openM(id: string): void;
declare function closeM(el: string | HTMLElement): void;
declare function showToast(msg: string, type: string): void;

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.querySelector('#s-tags tbody') as HTMLTableSectionElement | null;
  if (!tableBody) return;

  let currentEditRow: HTMLTableRowElement | null = null;

  function attachRowEvents(row: HTMLTableRowElement): void {
    const editBtn = row.querySelector('button:nth-of-type(1)') as HTMLButtonElement | null;
    const deleteBtn = row.querySelector('button:nth-of-type(2)') as HTMLButtonElement | null;

    if (!editBtn || !deleteBtn) return;

    editBtn.addEventListener('click', () => {
      currentEditRow = row;

      const tagCell = row.querySelector('td span.tg') as HTMLElement | null;
      const sermonsCell = row.children[1] as HTMLElement;
      const pfillDiv = row.querySelector('.pfill') as HTMLElement | null;
      const sourceCell = row.querySelector('td span.tblu, td span.tgr') as HTMLElement | null;

      const nameInput = document.querySelector('#edit-tag-name') as HTMLInputElement;
      const sermonsInput = document.querySelector('#edit-tag-sermons') as HTMLInputElement;
      const weightInput = document.querySelector('#edit-tag-weight') as HTMLInputElement;
      const sourceSelect = document.querySelector('#edit-tag-source') as HTMLSelectElement;

      if (!tagCell || !pfillDiv || !sourceCell) return;

      nameInput.value = tagCell.textContent || '';
      sermonsInput.value = sermonsCell.textContent || '0';
      weightInput.value = String(parseInt(pfillDiv.style.width) || 0);
      sourceSelect.value = sourceCell.textContent || '';

      openM('m-edit-tag');
    });

    deleteBtn.addEventListener('click', () => {
      currentEditRow = row;

      const tagCell = row.querySelector('td span.tg') as HTMLElement | null;
      const msg = document.getElementById('delete-tag-msg') as HTMLElement;

      if (tagCell) {
        msg.textContent = `Are you sure you want to delete the tag "${tagCell.textContent}"?`;
      }

      openM('m-delete-tag');
    });
  }

  // Attach to existing rows
  tableBody.querySelectorAll('tr').forEach((row) => {
    attachRowEvents(row as HTMLTableRowElement);
  });

  // Add Tag
  const addBtn = document.querySelector('#add-tag-btn') as HTMLButtonElement;
  addBtn.addEventListener('click', () => {
    const nameInput = document.querySelector('#new-tag-name') as HTMLInputElement;
    const sermonsInput = document.querySelector('#new-tag-sermons') as HTMLInputElement;
    const weightInput = document.querySelector('#new-tag-weight') as HTMLInputElement;
    const sourceSelect = document.querySelector('#new-tag-source') as HTMLSelectElement;

    const name = nameInput.value.trim();
    const sermons = parseInt(sermonsInput.value) || 0;
    const weight = parseInt(weightInput.value) || 0;
    const source = sourceSelect.value;

    if (!name) {
      alert('Tag name cannot be empty');
      return;
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span class="tag tg">${name}</span></td>
      <td>${sermons}</td>
      <td>
        <div class="pbar" style="width:80px">
          <div class="pfill" style="width:${weight}%"></div>
        </div>
      </td>
      <td><span class="tag ${source === 'AI' ? 'tblu' : 'tgr'}">${source}</span></td>
      <td>
        <button class="btn btn-g btn-sm">Edit</button>
        <button class="btn btn-g btn-sm" style="color:var(--red)">Delete</button>
      </td>
    `;

    tableBody.appendChild(row);
    attachRowEvents(row);

    closeM('m-tag');

    nameInput.value = '';
    sermonsInput.value = '0';
    weightInput.value = '0';
  });

  // Save Edit
  const saveBtn = document.querySelector('#save-edit-btn') as HTMLButtonElement;
  saveBtn.addEventListener('click', () => {
    if (!currentEditRow) return;

    const nameInput = document.querySelector('#edit-tag-name') as HTMLInputElement;
    const sermonsInput = document.querySelector('#edit-tag-sermons') as HTMLInputElement;
    const weightInput = document.querySelector('#edit-tag-weight') as HTMLInputElement;
    const sourceSelect = document.querySelector('#edit-tag-source') as HTMLSelectElement;

    const name = nameInput.value.trim();
    const sermons = parseInt(sermonsInput.value) || 0;
    const weight = parseInt(weightInput.value) || 0;
    const source = sourceSelect.value;

    if (!name) {
      alert('Tag name cannot be empty');
      return;
    }

    const tagCell = currentEditRow.querySelector('td span.tg') as HTMLElement;
    const sermonsCell = currentEditRow.children[1] as HTMLElement;
    const pfill = currentEditRow.querySelector('.pfill') as HTMLElement;
    const sourceCell = currentEditRow.querySelector('td span.tblu, td span.tgr') as HTMLElement;

    tagCell.textContent = name;
    sermonsCell.textContent = String(sermons);
    pfill.style.width = `${weight}%`;

    sourceCell.textContent = source;
    sourceCell.className = `tag ${source === 'AI' ? 'tblu' : 'tgr'}`;

    closeM(document.getElementById('m-edit-tag') as HTMLElement);
    currentEditRow = null;
  });

  // Delete
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn') as HTMLButtonElement;
  confirmDeleteBtn.addEventListener('click', () => {
    if (!currentEditRow) return;

    currentEditRow.remove();
    showToast('Tag deleted', 'ok');

    closeM('m-delete-tag');
    currentEditRow = null;
  });
});