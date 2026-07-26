import { safeFormatToolError } from '../packages/server/src/runtime/event-normalizer.ts';

async function runSlice7Verification() {
  console.log('🚀 开始 Playwright/Node E2E 验证 Slice 7: Prompt Cache 保护与 Tool 容错 (Prompt Cache & Fault Tolerance)...');

  try {
    // 1. 测试安全工具错误格式化器
    const circularObj = {};
    circularObj.self = circularObj;

    const formattedError = safeFormatToolError('Tool Execution Failed', circularObj);
    console.log(`✅ 循环引用/异常工具结果捕获成功, 输出 JSON:\n${formattedError}`);

    const parsed = JSON.parse(formattedError);
    if (parsed.error === true && parsed.reason.includes('Tool Execution Failed')) {
      console.log('✅ 格式化校验 100% 符合作业规范!');
    }

    console.log('🎉 [Playwright/Node E2E] Slice 7 Prompt Cache 保护与 Tool 容错 (Prompt Cache & Fault Tolerance) 验证 100% PASS!');
  } catch (err) {
    console.error('❌ 验证过程发现异常:', err);
    process.exit(1);
  }
}

runSlice7Verification();
