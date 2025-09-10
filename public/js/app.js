window.addEventListener('DOMContentLoaded', () => {
  
  // --- ELEMENT SELECTORS ---
  const fileListElement = document.getElementById('fileList');
  const fileContentElement = document.getElementById('fileContent');
  const statusElement = document.getElementById('status');
  const saveBtn = document.getElementById('saveBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  let selectedFilename = null;

  // --- CORE FUNCTIONS ---

  const loadFileList = async () => {
    statusElement.textContent = 'Loading file list...';
    try {
      const response = await fetch('/api/files');
      const files = await response.json();
      
      fileListElement.innerHTML = '';
      if (files.length === 0) {
        fileListElement.innerHTML = '<li>No files found in dataout/.</li>';
      } else {
        files.forEach(file => {
          const li = document.createElement('li');
          li.textContent = file;
          li.addEventListener('click', () => handleFileSelection(file));
          fileListElement.appendChild(li);
        });
      }
      statusElement.textContent = 'Status: Ready';
    } catch (error) {
      statusElement.textContent = 'Status: Could not load file list.';
    }
  };
  
  const handleFileSelection = async (filename) => {
    document.querySelectorAll('#fileList li').forEach(li => {
        li.classList.toggle('selected', li.textContent === filename);
    });

    selectedFilename = filename;
    statusElement.textContent = `Reading ${filename}...`;
    try {
      const response = await fetch(`/api/files/${filename}`);
      const result = await response.json();
      if (response.ok) {
        fileContentElement.value = result.content;
        statusElement.textContent = `Status: Loaded ${filename}.`;
      } else {
        statusElement.textContent = `Status: ${result.message}`;
      }
    } catch (error) {
      statusElement.textContent = 'Status: An error occurred while reading the file.';
    }
  };

  // --- EVENT LISTENERS ---

  // SAVE button
  saveBtn.addEventListener('click', async () => {
    const content = fileContentElement.value;
    if (!content.trim()) {
        statusElement.textContent = 'Status: Cannot save an empty file.';
        return;
    }

    statusElement.textContent = 'Saving new file...';
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });
      const result = await response.json();
      statusElement.textContent = `Status: ${result.message}`;
      if (response.ok) {
        fileContentElement.value = ''; // Clear textarea after saving
        await loadFileList(); // Refresh the file list to show the new file
      }
    } catch (error) {
      statusElement.textContent = 'Status: An error occurred while saving.';
    }
  });

  // DELETE button
  deleteBtn.addEventListener('click', async () => {
    if (!selectedFilename) {
      statusElement.textContent = 'Status: Please select a file from the list to delete.';
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedFilename}?`)) {
        return;
    }

    statusElement.textContent = `Deleting ${selectedFilename}...`;
    try {
      const response = await fetch(`/api/files/${selectedFilename}`, { method: 'DELETE' });
      const result = await response.json();
      statusElement.textContent = `Status: ${result.message}`;
      if (response.ok) {
        fileContentElement.value = '';
        selectedFilename = null;
        await loadFileList(); // Refresh the file list
      }
    } catch (error) {
      statusElement.textContent = 'Status: An error occurred while deleting.';
    }
  });

  // --- INITIALIZATION ---
  loadFileList();
});


