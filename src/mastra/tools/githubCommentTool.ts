// src/tools/codeReviewTool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const codeReviewTool = createTool({
    id: 'code-review',
    description: 'Validate and return code diff for review by the agent',
    inputSchema: z.object({
        diff: z.string().describe('Code diff to review, in diff format'),
    }),
    outputSchema: z.object({
        success: z.boolean().describe('Whether the diff is valid'),
        diff: z.string().optional().describe('Original code diff'),
        error: z.string().optional().describe('Error message if validation fails'),
    }),
    execute: async ({ context }) => {
        const { diff } = context;

        // 验证 diff 是否为空
        if (!diff || diff.trim() === '') {
            return {
                success: false,
                diff,
                error: 'No code diff provided for review.',
            };
        }

        // 简单验证 diff 格式（例如，包含 + 或 -）
        const hasDiffFormat = diff.includes('+') || diff.includes('-');
        if (!hasDiffFormat) {
            return {
                success: false,
                diff,
                error: 'Invalid diff format. Please provide a valid code diff with + or - lines.',
            };
        }

        // 返回验证通过的 diff
        return {
            success: true,
            diff,
            error: undefined,
        };
    },
});
