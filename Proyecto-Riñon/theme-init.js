// Run before styles paint. The current design remains the default.
try {document.documentElement.dataset.theme=localStorage.getItem('risio.theme.v1')==='dark'?'dark':'light';}catch{document.documentElement.dataset.theme='light';}
