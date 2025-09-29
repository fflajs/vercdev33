<script>
  async function renderOrgUnits(units, roles, people, parentId = null, container) {
    const children = units.filter(u => u.parent_id === parentId);
    children.forEach(unit => {
      const div = document.createElement('div');
      div.className = 'ml-6 mt-2';

      // Org unit name
      const header = document.createElement('div');
      header.className = 'font-bold';
      header.textContent = unit.name;
      div.appendChild(header);

      // Show roles/people
      const unitRoles = roles.filter(r => r.org_unit_id === unit.id);
      unitRoles.forEach(role => {
        const person = people.find(p => p.id === role.person_id);
        const p = document.createElement('p');
        p.className = 'ml-4 text-sm';
        p.textContent = `- ${person?.name} ${role.is_manager ? '(Manager)' : ''} ${role.description || ''}`;
        div.appendChild(p);
      });

      // Add Person link
      const addPersonLink = document.createElement('a');
      addPersonLink.href = '#';
      addPersonLink.className = 'ml-4 text-blue-500 text-sm hover:underline';
      addPersonLink.textContent = '➕ Add Person';
      addPersonLink.onclick = (e) => {
        e.preventDefault();
        showAddPersonForm(div, unit.id);
      };
      div.appendChild(addPersonLink);

      // Add Subunit link (from Step 1)
      const addLink = document.createElement('a');
      addLink.href = '#';
      addLink.className = 'ml-4 text-blue-500 text-sm hover:underline';
      addLink.textContent = '➕ Add Subunit';
      addLink.onclick = (e) => {
        e.preventDefault();
        showAddSubunitForm(div, unit.id);
      };
      div.appendChild(addLink);

      container.appendChild(div);
      renderOrgUnits(units, roles, people, unit.id, div);
    });
  }

  function showAddPersonForm(container, unitId) {
    const form = document.createElement('div');
    form.className = 'ml-6 mt-2 p-2 border rounded bg-gray-50';

    const select = document.createElement('select');
    select.className = 'border p-1 mr-2';
    orgData.people.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    form.appendChild(select);

    const managerLabel = document.createElement('label');
    managerLabel.className = 'ml-2 text-sm';
    const managerCheckbox = document.createElement('input');
    managerCheckbox.type = 'checkbox';
    managerLabel.appendChild(managerCheckbox);
    managerLabel.appendChild(document.createTextNode(' Manager'));
    form.appendChild(managerLabel);

    const desc = document.createElement('input');
    desc.type = 'text';
    desc.placeholder = 'Description';
    desc.className = 'ml-2 border p-1';
    form.appendChild(desc);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'ml-2 bg-blue-500 text-white px-2 py-1 rounded';
    saveBtn.onclick = async () => {
      const body = {
        person_id: select.value,
        org_unit_id: unitId,
        iteration_id: orgData.iteration.id,
        is_manager: managerCheckbox.checked,
        description: desc.value.trim()
      };

      const res = await fetch('/api/admin/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        await loadIterationAndUnits();
      } else {
        alert('Error: ' + data.message);
      }
    };
    form.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'ml-2 bg-gray-300 px-2 py-1 rounded';
    cancelBtn.onclick = () => form.remove();
    form.appendChild(cancelBtn);

    container.appendChild(form);
  }
</script>

