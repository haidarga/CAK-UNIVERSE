// Google Sheets API v4 helper for writing formatted naskah rows directly into a Google Sheet with styling
export async function pushValuesToGoogleSheet(accessToken: string, spreadsheetId: string, rows: any[][]) {
  const range = 'Sheet1!A1:J' + (rows.length + 1)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: rows,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // If Sheet1 range fails, try default range A1
    const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:J${rows.length + 1}?valueInputOption=USER_ENTERED`
    const fbRes = await fetch(fallbackUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `A1:J${rows.length + 1}`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    })
    const fbData = await fbRes.json().catch(() => ({}))
    if (!fbRes.ok) {
      throw new Error(fbData?.error?.message || data?.error?.message || `Google Sheets API error ${res.status}`)
    }
  }

  // Apply rich styling (Vertical Align TOP, Text Wrap, Dark Header, Custom Column Widths)
  await formatGoogleSheetStyling(accessToken, spreadsheetId, rows.length)

  return data
}

export async function formatGoogleSheetStyling(accessToken: string, spreadsheetId: string, rowCount: number) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`

  const columnWidths = [50, 180, 140, 90, 260, 360, 240, 360, 130, 200]

  const requests: any[] = [
    // 1. Vertical alignment TOP + Text Wrap for ALL cells
    {
      repeatCell: {
        range: {
          startRowIndex: 0,
          endRowIndex: rowCount + 5,
          startColumnIndex: 0,
          endColumnIndex: 10,
        },
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'TOP',
            wrapStrategy: 'WRAP',
            textFormat: {
              fontSize: 10,
            },
          },
        },
        fields: 'userEnteredFormat(verticalAlignment,wrapStrategy,textFormat)',
      },
    },
    // 2. Beautiful Header Styling (Dark Slate #1E293B, Bold White Text, Middle Centered)
    {
      repeatCell: {
        range: {
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 10,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
              fontSize: 10,
            },
            verticalAlignment: 'MIDDLE',
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)',
      },
    },
  ]

  // 3. Set custom column widths
  columnWidths.forEach((width, colIdx) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: 0,
          dimension: 'COLUMNS',
          startIndex: colIdx,
          endIndex: colIdx + 1,
        },
        properties: {
          pixelSize: width,
        },
        fields: 'pixelSize',
      },
    })
  })

  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  }).catch((e) => console.warn('Batch update formatting warning:', e))
}
