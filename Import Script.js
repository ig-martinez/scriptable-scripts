// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: download; share-sheet-inputs: plain-text, url;

/* -----------------------------------------------
Script      : Import Script.js
Author      : me@supermamon.com
Version     : 1.0.0
Description :
  A script to download and import files into the
  Scriptable folder. Includes a mini repo file 
  browser for github repos.

Supported Sites
* github.com
* gist.github.com
* pastebin.com
* raw code from the clipboard
----------------------------------------------- */
let url;
let data;

log(`args.urls: ${args.urls}`)

if (args.urls.length > 0) {
  input = args.urls[0]
} else {
  input = Pasteboard.paste()
}

if (!input) {
  log('nothing to work with')
  return
}

log(`input: ${input}`)

var urlType = getUrlType(input)
log(`urlType: ${JSON.stringify(urlType)}`)

if (!urlType) {
  let resp = await presentAlert('Unable to identify urls from the input. Is it already the actual code?', ["Yes","No"])
  if (resp==0) {
    urlType = {name:'code'}
  } else {
    await presentAlert('Unsupported input.')
    return
  }
}

switch (urlType.name) {
  case 'gh-repo': 
    data = await pickFileFromRepo(input, '')
    break;
  case 'gh-repo-folder':
    var slices = input.match(urlType.regex)
    log(slices.join("\n"))
    data = await pickFileFromRepo(slices[1], slices[3].replace(/^\//,''))
    log(data)
    break;
  case 'gh-repo-file': 
    var slices = input.match(urlType.regex)
    data = await getRepoFileDetails(slices[1],slices[3])
    break;
  case 'gh-repo-raw': 
    var slices = input.match(urlType.regex)
    log(slices)
    data = {
      source: 'repo',
      name: `${slices[2]}`,
      download_url: input
    }
    break;
  case 'gh-gist': 
    var slices = input.match(urlType.regex)
    log(slices)
    data = await getGistFileDetails(slices[3])
    break;
  case 'gh-gist-raw': 
    var slices = input.match(urlType.regex)
    log(slices)
    data = {
      source: 'gist',
      name: `${slices[1]}`,
      download_url: input
    }
    break;

  case 'pastebin': 
    var slices = input.match(urlType.regex)
    log(slices)
    data = {
      source: 'pastebin',
      name: `${slices[1]}.js`,
      download_url: input.replace('.com','.com/raw')
    }
    break;
  case 'pastebin-raw': 
    var slices = input.match(urlType.regex)
    log(slices)
    data = {
      source: 'pastebin',
      name: `${slices[1]}.js`,
      download_url: input
    }
    break;
  case 'code':
    data = {
      source: 'raw',
      name: 'Untitled.js',
      code: input
    }  
    break;
  default:
}

if (data) {

  let importedFile = await importScript(data)
  if (importedFile) {
    await presentAlert(`Imported ${importedFile}`,["OK"])
  }
  return
}

//------------------------------------------------
function getUrlType(url) {
  const typeMatchers = [
    {name: 'gh-repo',         regex: /^https:\/\/github.com\/[^\s\/]+\/[^\s\/]+\/?$/},
    {name: 'gh-repo-folder',  regex: /^(https:\/\/github.com\/[^\s\/]+\/[^\s\/]+)\/tree(\/[^\s\/]+)(\/[^\s]+)$/ },
    {name: 'gh-repo-file',    regex: /^(https:\/\/github.com\/[^\s\/]+\/[^\s\/]+)\/blob(\/[^\s\/]+)(\/[^\s]+)$/ },
    {name: 'gh-repo-raw',     regex: /^https:\/\/raw\.githubusercontent\.com\/([^\/]+\/)+([\S]+)$/ },
    {name: 'gh-gist',         regex: /^(https:\/\/gist\.github.com\/)([^\/]+)\/([a-z0-9]+)$/},
    {name: 'gh-gist-raw',     regex: /^https:\/\/gist\.githubusercontent\.com\/[^\/]+\/[^\/]+\/raw\/[^\/]+\/(.+)$/},
    {name: 'pastebin-raw',    regex: /^https:\/\/pastebin\.com\/raw\/([a-zA-Z\d]+)/},
    {name: 'pastebin',        regex: /^https:\/\/pastebin\.com\/([a-zA-Z\d]+)/}
  ]
  let types = typeMatchers.filter( matcher => {
    return matcher.regex.test(url)
  })
  return types.length?types[0]:null
}
//------------------------------------------------
async function pickFileFromRepo(url, path) {

  log('fn:pickFileFromRepo')
  log(`url = ${url}`)
  log(`path = ${path}`)

  url = url.replace(/\/$/,'')
  const apiUrl = url.replace('/github.com/','api.github.com/repos/')

  log(`apiURL=${apiUrl}`)

  let req = new Request(apiUrl)
  try {
    var data = await req.loadJSON()
  } catch (e) {
    await presentAlert("Unable to fetch repo information. Likely due to api limits", ["OK"])
    return null
  }
  
  let contents_url = data.contents_url
  log(`contents_url = ${contents_url}`)

  // get contents
  contents_url = contents_url.replace('{+path}',path)
  req = new Request(contents_url)
  try {
    var contents = await req.loadJSON()
  } catch (e) {
    await presentAlert("Unable to fetch repo information. Likely due to api limits", ["OK"])
    return null
  }
  
  log(contents.map(c=>c.name).join("\n"))

  let table = new UITable()
  let list = []

  // add a .. entry if path is passed
  if (path) {
    list.push({
      name: '..',
      type: 'dir',
      path: '..'
    })
  }

  list.push(contents)
  list = list.flat().sort( (a,b) => {
    if (a.type==b.type) {
      if (a.name.toLowerCase() < b.name.toLowerCase()) {
        return -1
      } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
        return 1
      }
    } else {
      if (a.type == 'dir' ) {
        return -1
      } else if (b.type == 'dir' ) {
        return 1
      }
    }

    return 0
  })
  
  let selected;
  list.forEach( content => {
    const row = new UITableRow()

    let name = content.name
    let display_name = content.type == 'dir' ? `${name}/` : name
    if (name=='..') display_name = name
 
    let icon = content.type=='dir'?(name=='..'?'arrow.left':'folder'):'doc'
    let sfIcon = SFSymbol.named(`${icon}.circle`)
    sfIcon.applyFont(Font.systemFont(25))
    let img = sfIcon.image
    let iconCell = row.addImage(img)
    iconCell.widthWeight = 10
    iconCell.centerAligned()

    let nameCell = row.addText(display_name)
    nameCell.widthWeight = 90

    row.onSelect = (index) => {
      selected = list[index]
    }

    table.addRow(row)
  })

  let resp = await table.present()

  if (!selected) return null

  log(selected.name)
  
  if (selected.type == 'dir') {
      if (selected.name == '..') {
        const lastPath = path.split('/').reverse().slice(1).reverse().join('/')
        selected = await pickFileFromRepo(url, lastPath)
      } else {
        selected = await pickFileFromRepo(url, selected.path)
      }
  }

  if (selected) {
    return {
      source: 'repo',
      name: selected.name,
      download_url: selected.download_url
    }
  } 
  return null
}
//------------------------------------------------
async function getRepoFileDetails(repoUrl, path) {

  repoUrl = repoUrl.replace(/\/$/,'')
  path = path.replace(/^\//,'')

  let apiUrl = repoUrl.replace('/github.com/',`api.github.com/repos/`)
  apiUrl = `${apiUrl}/contents/${path}`
  const req = new Request(apiUrl)
  try {
    var resp = await req.loadJSON()
  } catch(e) {
    await presentAlert("Unable to fetch repo information. Likely due to api limits", ["OK"])
    return null
  }

  const data = {
    source: 'repo',
    name: resp.name,
    path: resp.path,
    download_url: resp.download_url
  }
  return data

}
//------------------------------------------------
async function getGistFileDetails(gistId) {
  let apiUrl = `https://api.github.com/gists/${gistId}`  
  log(apiUrl)
  const req = new Request(apiUrl)

  try {
    var resp = await req.loadJSON()
  } catch(e) {
    await presentAlert("Unable to fetch repo information. Likely due to api limits", ["OK"])
    return null
  }

  const filename = Object.keys(resp.files)[0]
  const file = resp.files[filename]
  const data = {
    source: 'gist',
    name: filename,
    download_url: file.raw_url
  }
  return data
}
//------------------------------------------------
async function importScript(data) {
  const fm = FileManager.iCloud() 

  log(`fn:importScript`)
  log(data.source)
  log(data.name)

  var code;
  var name = data.name

  if (data.source == 'raw' ) {
    code = data.code
  } else {
    let url = data.download_url
    let resp = await presentAlert(`Download ${name}?`,["Yes","No"])
    if (resp==0) {
      log(`downloading from ${url}`)
      const req = new Request(url)
      code = await req.loadString()
    }  
  }

  if (code) {

    let filename = name
    let fileExists = true

    while(fileExists) {
      filename = await presentPrompt("Save as", filename)
      log(filename)

      if (filename) {
        let savePath = fm.joinPath(fm.documentsDirectory(), filename)
        fileExists = fm.fileExists(savePath)
        log(fileExists)

        if (fileExists) {
          let resp = await presentAlert('File exists. Overwrite?',["Yes","No","Cancel"])
          if (resp==2) {
            fileExists = false
            filename = null
          } else {
            fileExists = resp == 1
          }
        }
      } else {
        fileExists = false
      }
    }

    if (filename) {
      log(`saving ${filename}`)
      const path = fm.joinPath(fm.documentsDirectory(), filename)
      fm.writeString(path, code)
      return filename
    }
  } 
  return null
}
//------------------------------------------------
async function presentAlert(prompt,items = ["OK"],asSheet) 
{

  let alert = new Alert()
  alert.message = prompt
  
  for (const item of items) {
    alert.addAction(item)
  }
  let resp = asSheet ? 
    await alert.presentSheet() : 
    await alert.presentAlert()
  log(resp)
  return resp
}
//------------------------------------------------
async function presentPrompt(prompt,defaultText) 
{
  let alert = new Alert()
  alert.message = prompt

  alert.addTextField("",defaultText)
  
  var buttons = ["OK", "Cancel"]
  for (const button of buttons) {
    alert.addAction(button)
  }
  let resp = await alert.presentAlert()
  if (resp==0) {
    return alert.textFieldValue(0)
  }
  return null
}
