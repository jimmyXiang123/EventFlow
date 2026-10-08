@echo off
chcp 65001 >nul
echo ======================================
echo EventFlow 生产打包 + 预览
echo ======================================
D:
cd D:\Users\86158\Documents\deepseek-harness\default-workspace\eventflow
echo.
echo 1. 执行 pnpm build
pnpm build
echo.
echo 2. 执行 pnpm preview
pnpm preview
pause
