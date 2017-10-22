const fs = require('fs');
const lockfile = require('@yarnpkg/lockfile');
const http = require('http')

let dependencies;
let installedPackages;
let packageData = {};
let packageCounter = 0;
let errorCounter = 0;
let numberPackages;
let testList = []

let start;
let end;

const agents = []
for(var i = 0; i < 4; i++) {
  agents[i] = new http.Agent({ keepAlive: true })
}
// const keepAliveAgent = new http.Agent({ keepAlive: true });
const globalOptions = {
  //agent: false,
  //agend: keepAliveAgent,
  host: 'registry.npmjs.org',
  timeout: 5000,
  //headers: {}
};


function getDependencies() {
  fs.readFile('./test-data/package.json', 'utf8', (err, data) => {
    if(err) {
      console.log(`could not read package.json: ${err}`)
      return err
    }
    if(!data.length) {
      console.log('package.json is empty')
      return
    }
    const package = JSON.parse(data)
    const deps = {
      devDependencies: Object.keys(package.devDependencies),
      dependencies: Object.keys(package.dependencies),
      optionalDependencies: Object.keys(package.optionalDependencies),
    }
    dependencies = deps
    numberPackages = deps.devDependencies.length + deps.dependencies.length + deps.optionalDependencies.length
    if (installedPackages) {
      matchMaxVersion()
    }
  })
}


const getInstalledPackages = () => {
  fs.readFile('./test-data/yarn.lock', 'utf8', (err, data) => {
    if(err) {
      console.log(`could not read yarn.lock: ${err}`)
      return err
    }
    if(!data.length) {
      console.log('yarn.lock is empty')
      return
    }
    const lockFile = lockfile.parse(data)
    let packages = {}

    Object.entries(lockFile.object).forEach(([key, value]) => {
      const name = key.split('@')[0]
      if(packages[key]) {
        packages.key.versions.push(value.version)
      }
      else {
        packages[name] = { name, versions: [ value.version ]}
      }
    })
    installedPackages = packages
    if (dependencies) {
      matchMaxVersion()
    }
  })
}

const matchMaxVersion = () => {

  start = new Date()
  Object.entries(dependencies).forEach(([depType, list]) => {
    packageData[depType] = list.map((package, index) => {
      const version = installedPackages[package].versions.sort()[0]
      getNpmData(package, index, depType)
      return { name: package, maxVersion: version }
    })
  })
}

const getNpmData = (package, index, depType) => {
  const agent = agents[index % 4]
  const options = { ...globalOptions, agent, path: `/${package}`}
  http.get(options, (res) => {
    const { statusCode, headers } = res

    if (statusCode === 200) {
      let body = '';
      res.on('data', d => body += d)
      res.on('end', () => {
        saveNpmData(index, body, depType)
        afterResponse()
      })
    } else {
      console.log(`no info found for ${package}`)
      packageData[depType][index].error = true
      errorCounter ++
      afterResponse()
    }
  })
}

const saveNpmData = (index, body, depType) => {
  const res = JSON.parse(body)
  packageData[depType][index] = {
    ...packageData[depType][index],
    latestVersion: res['dist-tags'].latest,
    readme: res.readme,
    homepage: res.homepage,
    keywords: res.keywords,
    license: res.license,
    repository: res.respository && res.repository.url,
    installed: res.versions[packageData[depType][index].maxVersion],
  }
}

const afterResponse = () => {
  packageCounter ++
  if (packageCounter >= numberPackages) {
    //keepAliveAgent.destroy()
    agents.forEach(agent => agent.destroy())
    writeMd()
  }
}

const writeMd = () => {
  end = new Date()
  Object.entries(packageData).forEach(([key, value]) => {
      console.log(`Dependencies of type ${key}\n`)
      console.log(
        value.filter(entry => !entry.error)
        .map(entry => `${entry.name} | ${entry.maxVersion} | ${entry.latestVersion} | ${entry.homepage}\n`)
        .reduce((acc, curr) => acc + curr, "")
      )
  })
  console.log(end - start)
}

getInstalledPackages()
getDependencies()
