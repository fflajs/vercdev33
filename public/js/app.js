// This function runs when the entire HTML page has been loaded
window.addEventListener('DOMContentLoaded', () => {
  const timeElement = document.getElementById('server-time');

  // Use the browser's fetch API to call our back-end
  fetch('/api/time')
    .then(response => response.json()) // Parse the JSON response
    .then(data => {
      // Update the HTML element with the data from the server
      timeElement.textContent = `Server time in ${data.location} is: ${data.currentTime}`;
    })
    .catch(error => {
      console.error('Error fetching time:', error);
      timeElement.textContent = 'Could not fetch server time.';
    });
});
