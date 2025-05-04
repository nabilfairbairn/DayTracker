const form = document.getElementById("task-form");
const activityChartCanvas = document.getElementById("activity-chart");
const tokenChartCanvas = document.getElementById("token-chart");
const chlobutton = document.getElementById('chlo_button')
let activityChart;
let tokenChart

const oauth_client = '675594961841-djeb0787v1g6afhbs6pf4ljt3q7c1ou9.apps.googleusercontent.com'
const oauth_secret = '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'
const sheet_id = '1AEAlJoTK_xVX8zlfpnX_h7W2xonOhi5KOwG00BYCDgc'
const SHEET_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}/values`; 
const API_KEY = 'AIzaSyCVz393At5pi7E1bQFp0ZaYs1oHB6_ShBE';
const APPEND_URL = `${SHEET_API_URL}/Sheet1:append?valueInputOption=USER_ENTERED&key=${API_KEY}`;
const CHART_DATA_URL = `${SHEET_API_URL}/ChartData!A1:D?key=${API_KEY}`;  // ChartData should have preprocessed values
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

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

window.addEventListener("load", function() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  var hour = now.getHours();
  var minute = now.getMinutes();
  var localDatetime = year + "-" +
                    (month < 10 ? "0" + month.toString() : month) + "-" +
                    (day < 10 ? "0" + day.toString() : day) + "T" +
                    (hour < 10 ? "0" + hour.toString() : hour) + ":" +
                    (minute < 10 ? "0" + minute.toString() : minute)
  var datetimeField = document.getElementById("event-date");
  datetimeField.value = localDatetime;
});

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

function current_date_date() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const day = String(now.getDate()).padStart(2, '0');

  const formatted = `${year}-${month}-${day}`;
  return formatted
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const activity = document.getElementById("activity").value;
  const eventDate = document.getElementById("event-date").value.replace('T', ' '); 
  const recordedDate = current_date_hours_minutes();

  let range = 'Activities!A1:C1'
  let values = [[eventDate, activity, recordedDate]]

  await appendValues(sheet_id, range, values)

  updateActivitiesChart()
  
});

chlobutton.addEventListener('click', (e) => {
  e.preventDefault();
  alert('What would you say if I call you my girlfriend and you call me your boyfriend?')
})

async function appendValues(spreadsheetId, range, values) { // values must be 2 nested arrays
  const body = {
    values: values
  };

  try {
    const response = await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: body,
      insertDataOption: 'INSERT_ROWS'
    });
    
  } catch (err) {
    console.log('Error:');
    console.log(err.message);
    throw err; // rethrow so caller knows there was an error
  }
}

async function tokenManagement() {
  // read last token management date
  let range = 'Token Acquisition'
  let last_date_str = await getValues(sheet_id, range)
  last_date_str = last_date_str.LastTokenEvalDate[0] 

  range = 'Token Activities'
  let token_activities = await getValues(sheet_id, range)
  let used_expired = token_activities['IsSpent/Expired']
  let expiry_dates = token_activities['ExpiryDate']

  const last_date = new Date(last_date_str);
  last_date.setHours(0, 0, 0, 0);

  const today = new Date()
  today.setHours(0,0,0,0)

  // if date is before today, run
  if (isStrictlyBeforeToday(last_date)) {
    range = '2 weeks of Activity Balances'
    let week_balances = await getValues(sheet_id, range)
    // for each day between lastmanagementdate and today, pull 1 week net balance
    const first_date_index = week_balances.Day.findIndex(dateStr => new Date(dateStr) > last_date && new Date(dateStr) <= today); // Find the index of the first date greater than DateA
   
    // if balance > 100, add Earn Token row for that day
    let dates_to_give_tokens = []
    let dates_to_expire_tokens = []
    for (let i = first_date_index; i < week_balances['1weeknetBalance'].length - 1; i++) { // - 2 so doesn't calculate for tomorrow
      let date_to_consider = week_balances['Day'][i]
      let balance_to_consider = week_balances['1weeknetBalance'][i]

      
      if (balance_to_consider >= 100) {
        dates_to_give_tokens.push(date_to_consider)
      }

      // read token activities
      // if any have expiry on the day and are not used, write a 1 there

      for (let i = 0; i < expiry_dates.length; i++) {
        let exp_date = expiry_dates[i]
        if (exp_date == date_to_consider && used_expired[i] != 1) {
          dates_to_expire_tokens.push(i)
        }
      }
    }

    range = 'Token Activities'
    if (dates_to_give_tokens.length > 0) {
      
      let activity_name = 'Earn Token'
      dates_to_give_tokens.forEach(async (day) => {
        await appendValues(sheet_id, 'Token Activities', [[activity_name, day]])
        
      })
    }

    if (dates_to_expire_tokens.length > 0) {
      console.log('expiring')
      dates_to_expire_tokens.forEach(async (idx) => {
        let row_num = idx + 2
        let range = `'Token Activities'!L${row_num}`
        await write_in_range(sheet_id, range, [[1]])
        range = `'Token Activities'!A1:B1`
        let exp_date = expiry_dates[idx]
        await appendValues(sheet_id, range, [['Token Expire', exp_date]])
      })
    }
    // overwrite last token management date to today's date
    const today_str = current_date_date()
    await write_in_range(sheet_id, `'Token Acquisition'!A2`, [[today_str]])
  }
  return
}


async function write_in_range(spreadsheetId, range, values) {
  // let values = [
  //   [
  //     // Cell values ...
  //   ],
  //   // Additional rows ...
  // ];
  // values = _values;
  const body = {
    values: values,
  };
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: body,
    })
  } catch (err) {
    console.error(err)
    return;
  }
}


function isStrictlyBeforeToday(dateToCheck) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return dateToCheck.getTime() < today.getTime();
}


async function updateActivitiesChart() {
  let range = '2 weeks of Activity Balances'
  let chart_data = await getValues(sheet_id, range);

  const { Day, PositiveInDay, NegativeinDay, PositiveActivitiesInDay, NegativeActivitiesInDay } = chart_data;
  const oneweekbalances = chart_data['1weeknetBalance']
  const days = Day
  const positives = PositiveInDay
  const negatives = NegativeinDay
  const p_activities = PositiveActivitiesInDay // TODO: separate positive and negative activities
  const n_activities = NegativeActivitiesInDay

  if (activityChart) activityChart.destroy();

  let positive_tooltip_func = {
    callbacks: {
        label: function(context) {
          const labelLines = [];
          const value = context.parsed.y;
          const activityList = p_activities[context.dataIndex];
      
          labelLines.push(` +${value}:`);
      
          // Split by comma, trim, and add each activity on a new line
          const activityItems = activityList.split(',').map(item => item.trim());
          labelLines.push(...activityItems);
      
          return labelLines;
        }
    }
  }

  let negative_tooltip_func = {
    callbacks: {
        label: function(context) {
          const labelLines = [];
          const value = context.parsed.y;
          const activityList = n_activities[context.dataIndex];
      
          labelLines.push(` ${value}:`);
      
          // Split by comma, trim, and add each activity on a new line
          const activityItems = activityList.split(',').map(item => item.trim());
          labelLines.push(...activityItems);
      
          return labelLines;
        }
    }
  }



  activityChart = new Chart(activityChartCanvas, {
    data: {
      labels: days,
      datasets: [
        {
          type: 'bar',
          label: "Positive Activities",
          data: positives,
          backgroundColor: "rgba(75, 192, 192, 0.7)",
          stack: 'combined', // needed?
          tooltip: positive_tooltip_func
            
        },
        {
          type: 'bar',
          label: "Negative Activities",
          data: negatives,
          backgroundColor: "rgba(255, 99, 132, 0.7)",
          stack: 'combined',
          tooltip: negative_tooltip_func
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

async function updateTokenChart() {
  let range = '2 weeks of Token Balances'
  let chart_data = await getValues(sheet_id, range);

  const { Day, TokensEarned, TokensSpent, TokensExpired, EODTokenBalance } = chart_data;
  const days = Day

  let earned_data = []
  let spent_data = []
  let expired_data = []
  let balance_data = []

  TokensEarned.forEach((val, idx) => {
    let day = days[idx]
    let spent = TokensSpent[idx]
    let expired = TokensExpired[idx]
    let balance = EODTokenBalance[idx]
    // for (i = 1; i++; i<=val) {
    //   earned_data.push({x: day, y: i})
    // }

    if (val > 0) {
      earned_data.push({'x': day, 'y': val})
    }
    let neg = 0
    if (spent > 0) {
      spent_data.push({'X': day, 'y': spent})
      neg -= 1
    }
    if (expired > 0) {
      expired_data.push({'X': day, 'y': expired+neg})
    }
    balance_data.push(balance)
  
  })


  if (tokenChart) tokenChart.destroy();

  tokenChart = new Chart(tokenChartCanvas, {
    data: {
      labels: days,
      datasets: [
        {
          type: 'scatter',
          label: "Earned",
          data: earned_data,
          backgroundColor: "rgb(75, 192, 192)",
          order: 2
        },
        {
          type: 'scatter',
          label: "Expired",
          data: expired_data,
          backgroundColor: "rgb(255, 138, 29)",
          order: 2 
        },
        {
          type: 'scatter',
          label: "Spent",
          data: spent_data,
          backgroundColor: "rgb(33, 214, 27)",
          order: 2
        },
        {
          type: 'line',
          label: "EOD Balance",
          data: EODTokenBalance,
          backgroundColor: "rgb(174, 62, 189)",
          order: 1
        }
      ]
    },
    options: {
      datasets: {
        scatter: {
          elements: {
            point: {
              radius: 10
            }
        }
      }
    },
      responsive: true,
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        },
        x: {
          type: 'category'
        }
      }
    }
  });
}


async function updateTokens() {
  let values = await getValues(sheet_id, 'Current Tokens')
  let current_tokens = values['TotalTokens'][0]
  let today_tokens = values['TodayTokenBalance'][0]

  document.getElementById('total_tokens').innerText = current_tokens
  document.getElementById('today_tokens').innerText = today_tokens
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

async function getValues(spreadsheetId, range) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
      majorDimension: 'COLUMNS'
    });

    const data = response.result.values;
    console.log('data retrieved');

    const chart_data = parse_sheet_data(data);
    

    return chart_data;
    
  } catch (err) {
    console.log('Error:');
    console.log(err.message);
    throw err; // rethrow so caller knows there was an error
  }
}


function makechlobuttonvisible() {
  chlobutton.style.display = 'block'
}

async function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    makechlobuttonvisible();
    await tokenManagement()
    
    updateActivitiesChart()
    updateTokens()
    updateTokenChart()
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
}, 2000);


