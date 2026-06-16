module.exports = {
  apps: [
    {
      name: "tekuchi-frontend",
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "comparer-api",
      cwd: "./server/comparer",
      script: "./venv/Scripts/uvicorn.exe", 
      args: "main:app --host 0.0.0.0 --port 8000 --workers 2"
    }
  ]
};