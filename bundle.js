// bundler.js
const ENTRY = './index.js'

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');
const uglifyjs = require('uglify-js');

const moduleAnalyzer = (filename) => {
  const content = fs.readFileSync(filename, 'utf-8');
  // 将拿到的文件内容解析为ast，由于我们写的代码一般使用ESModule,所以设置sourceType: 'module'以获支持，详见https://www.babeljs.cn/docs/babel-parser
  const ast = parser.parse(content, {
    sourceType: 'module'
  })
  const dependencies = {}
  traverse(ast, {
    // 解析import语句，获取到导入路径
    ImportDeclaration({ node }){
      const dirname = path.dirname(filename)
      const newFile = './' + path.join(dirname,node.source.value)
      dependencies[node.source.value] = newFile
    }
  })
   // 将ast经过预设转换为执行代码
  const { code } = babel.transformFromAst(ast, null, {
    presets: ['@babel/preset-env']
  })
  return {
    filename,
    dependencies,
    code
  }
}

const buildDependencyGraph = (entry) => {
  const entryModule = moduleAnalyzer(entry)
  const graphArr = [ entryModule ]
  for(let i = 0; i < graphArr.length; i++) {
    const item = graphArr[i]
    const { dependencies } = item
    if(dependencies) {
      for(let j in dependencies) {
        graphArr.push(moduleAnalyzer(dependencies[j]))
      }
    }
  }
  const graph = {}
  graphArr.forEach(item => {
    graph[item.filename] = {
      dependencies: item.dependencies,
      code: item.code
    }
  })
  return graph
}

const generateCode = (entry) => {
  const graph = JSON.stringify(buildDependencyGraph(entry))
  return `(function(graph) {
    function require(module){
      function newRequire(relativePath){
        return require(graph[module].dependencies[relativePath])
      }
      var exports = {};
      (function(require, exports, code){
        eval(code)
      })(newRequire, exports, graph[module].code)
      return exports
    }
    require('${entry}')
  })(${graph})`
}
const code = uglifyjs.minify(generateCode(ENTRY)).code

if(!fs.existsSync('./dist')) {
  fs.mkdir('./dist', () =>{})
}

fs.writeFileSync('./dist/bundle.js', code)
