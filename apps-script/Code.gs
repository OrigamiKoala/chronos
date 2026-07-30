const sheet = SpreadsheetApp.getActiveSpreadsheet();
const dashboardSheet = sheet.getSheetByName("Dashboard");
const logSheet = sheet.getSheetByName("Log");
var VERCEL_BASE = 'https://chronos-bot.vercel.app';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Chronos Bot')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Called from the client via google.script.run (see src/apiShim.js).
// Forwards to the Vercel deployment server-to-server, so the student's
// browser never has to reach chronos-bot.vercel.app directly.
function apiProxy(path, method, body) {
  var options = {
    method: (method || 'GET').toLowerCase(),
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body) {
    options.payload = body;
  }

  var response = UrlFetchApp.fetch(VERCEL_BASE + path, options);

  return {
    status: response.getResponseCode(),
    body: response.getContentText(),
    contentType: 'application/json',
  };
}
function cellToHtml(range) {
  let values = range.getRichTextValues();

  let htmlResult = values.map(row => row.map(value => {
    let runs = value.getRuns();

    let formattedRuns = runs.map(run => {
      let text = run.getText();

      let link = run.getLinkUrl();
      let parentTag = "span";
      let attrString = "";

      let style = run.getTextStyle();

      let tags = [];
      if (style.isBold()) {
        tags.push("b");
      }
      if (style.isItalic()) {
        tags.push("i");
      }
      if (style.isUnderline()) {
        tags.push("u");
      }
      if (style.isStrikethrough()) {
        tags.push("strike");
      }

      if (link) {
        parentTag = "a";
        attrString = `href="${link}"`;
        tags = [];
      } else {
        if (tags.length == 0) {
          return text.replace(/[\r\n]{2}/g, "<br>");
        } else if (tags.length == 1) {
          parentTag = tags[0];
          tags = [];
        }
      }

      let headTags = tags.length ? `<${tags.join("><")}>` : "";
      let closeTags = tags.length ? `</${tags.join("></")}>` : "";

      return `<${parentTag} ${attrString}>${headTags}${text}${closeTags}</${parentTag}>`.replace(/[\r\n]{2}/g, "<br><br>");
    });

    return formattedRuns.join("");
  }));

  if (htmlResult && htmlResult.length > 0 && htmlResult[0].length > 0) {
    return htmlResult[0][0];
  }
  return "";
}

function query(id, yap, leavingText) {
  if (!id) {
    return { "yes": false, "name": "", "message": "" };
  }

  var studentRange;
  try {
    studentRange = dashboardSheet.getRange(dashboardSheet.getRange(1, 2, dashboardSheet.getLastRow(), 1).createTextFinder(id).findNext().getRow(), 1, 1, dashboardSheet.getLastColumn());
  } catch {
    return { "yes": false, "name": "", "message": "" };
  }

  const now = new Date();
  const pstDisplay = now.toLocaleString("en-US", { 
    timeZone: "America/Los_Angeles" 
  });

  studentRange.getCell(1,1).setFontWeight("bold");
  studentRange.getCell(1,3).setValue(pstDisplay);
  studentRange.getCell(1,5).setValue(yap);
  studentRange.getCell(1,6).setValue(leavingText);
  var studentValues = studentRange.getValues()[0];

  logSheet.appendRow([studentValues[0], pstDisplay, studentValues[4]]);

  return { "name": studentValues[0], "message": cellToHtml(studentRange.getCell(1,4)) };
}
