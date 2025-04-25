const form = document.getElementById("task-form");
const chartCanvas = document.getElementById("activity-chart");
const chlobutton = document.getElementById('chlo_button')
let chart;

const oauth_client = '675594961841-djeb0787v1g6afhbs6pf4ljt3q7c1ou9.apps.googleusercontent.com'
const oauth_secret = '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'
const sheet_id = '1AEAlJoTK_xVX8zlfpnX_h7W2xonOhi5KOwG00BYCDgc'
const SHEET_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}/values`; 
const API_KEY = 'AIzaSyCVz393At5pi7E1bQFp0ZaYs1oHB6_ShBE';
const APPEND_URL = `${SHEET_API_URL}/Sheet1:append?valueInputOption=USER_ENTERED&key=${API_KEY}`;
const CHART_DATA_URL = `${SHEET_API_URL}/ChartData!A1:D?key=${API_KEY}`;  // ChartData should have preprocessed values
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

const activity_sheet_range = '2 weeks of Activity Balances'

let chart_data = []

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

function sortActivitiesByScoreDesc() {
  const select = document.getElementById('activity');
  const options = Array.from(select.options);

  options.sort((a, b) => {
    return Number(b.dataset.score) - Number(a.dataset.score);
  });

  // Remove existing options
  select.innerHTML = '';

  // Re-add sorted options
  options.forEach(option => select.appendChild(option));
}

sortActivitiesByScoreDesc()

function current_date_hours_minutes() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const formatted = `${year}-${month}-${day} ${hours}:${minutes}`;
  return formatted
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const activity = document.getElementById("activity").value;
  const eventDate = document.getElementById("event-date").value.replace('T', ' '); 
  const recordedDate = current_date_hours_minutes();

  console.log(eventDate)
  console.log(recordedDate)

  const body = {
    values: [[eventDate, activity, recordedDate]]
  };

  try {
    gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheet_id,
      range: 'Activities!A1:C1',
      valueInputOption: 'USER_ENTERED',
      resource: body,
      insertDataOption: 'INSERT_ROWS'
    }).then(async (response) => {
      const result = response.result;
      console.log(`${result.updates.updatedCells} cells appended.`);
      
      form.reset();
      getValues(sheet_id, activity_sheet_range, updateChart);
    });
  } catch (err) {
    console.error(err.message);
    return;
  }

  
});

chlobutton.addEventListener('click', (e) => {
  e.preventDefault();
  alert('What would you say if I call you my girlfriend and you call me your boyfriend?')
})


async function updateChart(chart_data) {
  const { Day, PositiveInDay, NegativeinDay } = chart_data;
  const oneweekbalances = chart_data['1weeknetBalance']
  const days = Day
  const positives = PositiveInDay
  const negatives = NegativeinDay

  if (chart) chart.destroy();

  chart = new Chart(chartCanvas, {
    data: {
      labels: days,
      datasets: [
        {
          type: 'bar',
          label: "Positive Activities",
          data: positives,
          backgroundColor: "rgba(75, 192, 192, 0.7)",
          stack: 'combined' // needed?
        },
        {
          type: 'bar',
          label: "Negative Activities",
          data: negatives,
          backgroundColor: "rgba(255, 99, 132, 0.7)",
          stack: 'combined'
        },
        {
          type: 'line',
          label: "7-Day Net Sum",
          data: oneweekbalances,
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 2,
          fill: false,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          stacked: true,
          beginAtZero: true
        }
      }
    }
  });
}


function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

/**
       * Callback after the API client is loaded. Loads the
       * discovery doc to initialize the API.
       */
async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
}

/**
       * Callback after Google Identity Services are loaded.
       */
function gisLoaded() {
  console.log('initializing token client')
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: oauth_client,
    scope: SCOPES,
    callback: '' // defined later
  });
  gisInited = true;
}

function getValues(spreadsheetId, range, callback) {
  try {
    gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
      majorDimension: 'COLUMNS'
    }).then((response) => {
      const data = response.result.values;
      console.log('data retrieved')
      chart_data = parse_sheet_data(data)
      makechlobuttonvisible()
      if (callback) callback(chart_data);
    });
  } catch (err) {
    console.log('Error:')
    console.log(err.message);
    return;
  }
}

function makechlobuttonvisible() {
  chlobutton.style.display = 'block'
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    getValues(sheet_id, activity_sheet_range, updateChart);
  };

  if (gapi.client.getToken() === null) {
    console.log('no token found')
    // Prompt the user to select a Google Account and ask for consent to share their data
    // when establishing a new session.
    tokenClient.requestAccessToken({prompt: ''});
  } else {
    console.log('existing token found')
    // Skip display of account chooser and consent dialog for an existing session.
    tokenClient.requestAccessToken({prompt: ''});
  }
}

function parse_sheet_data(data) {
  const sheet_data = {}
  data.forEach((col) => {
    const col_label = col[0].replace(/\s+/g, ''); // remove whitespace for easier destructing
    const col_data = col.slice(1)
    sheet_data[col_label] = col_data
  })
  return sheet_data
}

setTimeout(() => {
  handleAuthClick()
}, 1000);


