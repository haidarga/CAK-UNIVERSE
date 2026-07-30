// Google Sheets API v4 helper for writing formatted naskah rows directly into a Google Sheet
export async function pushValuesToGoogleSheet(accessToken: string, spreadsheetId: string, rows: any[][]) {
  const range = 'Sheet1!A1:K' + (rows.length + 1)
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
    const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:K${rows.length + 1}?valueInputOption=USER_ENTERED`
    const fbRes = await fetch(fallbackUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `A1:K${rows.length + 1}`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    })
    const fbData = await fbRes.json().catch(() => ({}))
    if (!fbRes.ok) {
      throw new Error(fbData?.error?.message || data?.error?.message || `Google Sheets API error ${res.status}`)
    }
    return fbData
  }
  return data
}
