export function createSocialShareBlogHandler(bridge) {
    return async (payload, signal, job) => {
        const p = payload;
        if (!p || typeof p !== 'object' || !['x', 'threads'].includes(String(p.platform))
            || typeof p.account !== 'string' || typeof p.article_url !== 'string'
            || typeof p.text !== 'string' || typeof p.operation_key !== 'string')
            throw new Error('SOCIAL_INVALID_PAYLOAD');
        if (!bridge)
            throw new Error('Chrome extension bridge is unavailable');
        const result = await bridge.execute({ ...(job ?? {}), id: job?.id ?? 'extension-command', job_type: 'social.share_blog', payload }, signal);
        if (p.dry_run === true && result.state === 'ready' && result.dry_run === true)
            return result;
        if (result.state !== 'published' || typeof result.post_url !== 'string'
            || result.account !== p.account || result.platform !== p.platform || result.operation_key !== p.operation_key)
            throw new Error('SOCIAL_POST_UNCERTAIN: 投稿結果を確認できません。');
        const url = new URL(result.post_url);
        const path = p.platform === 'x' ? `/${p.account}/status/` : `/@${p.account}/post/`;
        if (url.protocol !== 'https:' || !((p.platform === 'x' ? ['x.com'] : ['threads.com', 'www.threads.com']).includes(url.hostname))
            || !url.pathname.toLowerCase().startsWith(path.toLowerCase()) || !/^[A-Za-z0-9_-]+$/.test(url.pathname.slice(path.length)))
            throw new Error('SOCIAL_POST_UNCERTAIN: 投稿URLが一致しません。');
        return result;
    };
}
//# sourceMappingURL=socialShareBlog.js.map