/* Durable, account-scoped optimistic messages. Server acknowledgement is separate. */
(() => {
  window.GsnOutbox = ({storage, send, changed, delivered, warning = () => {}}) => {
    const accounts = new Map(), queues = new Map();
    const key = account => 'gsn-chat-outbox:' + account;
    function records(account) {
      if (!accounts.has(account)) {
        let saved = [];
        try { saved = JSON.parse(storage.getItem(key(account)) || '[]'); } catch {}
        accounts.set(account, new Map((Array.isArray(saved) ? saved : []).filter(m => m.authorId === account && typeof m.id === 'string' && typeof m.channelId === 'string').map(m => [m.id, {...m, pending: true, delivery: 'failed', error: 'Confirmation was interrupted. Check the conversation before retrying.'}])));
      }
      return accounts.get(account);
    }
    function persist(account) { storage.setItem(key(account), JSON.stringify([...records(account).values()])); }
    function notify(account) { changed(account); }
    function launch(account, record) {
      const task = (queues.get(account) || Promise.resolve()).then(async () => {
        try {
          const result = await send(record);
          if (!result?.message?.id) throw Error('No server confirmation. Check the conversation before retrying.');
          records(account).delete(record.id);
          try { persist(account); } catch { warning('Message delivered, but local recovery storage could not be updated.'); }
          delivered(account, record.channelId, result.message, record);
        } catch (error) {
          record.delivery = 'failed';
          record.error = (error.message || 'Message was not confirmed.') + ' Check the conversation before retrying.';
          try { persist(account); } catch { warning('Keep this tab open to preserve the unconfirmed message.'); }
        }
        notify(account);
      });
      queues.set(account, task.catch(() => {}));
      return task;
    }
    return {
      list: (account, channel) => [...records(account).values()].filter(m => m.channelId === channel),
      enqueue(account, message) {
        const items = records(account);
        if (items.size >= 25) throw Error('Finish or retry your unconfirmed messages first. Your draft is kept.');
        const record = {...message, id: 'local-' + crypto.randomUUID(), authorId: account, createdAt: Date.now(), pending: true, delivery: 'pending'};
        items.set(record.id, record);
        try { persist(account); } catch { items.delete(record.id); throw Error('Local storage is full. Your draft is kept; free space before sending.'); }
        notify(account); void launch(account, record);
        return record;
      },
      retry(account, id) {
        const record = records(account).get(id);
        if (!record || record.delivery !== 'failed') return;
        record.delivery = 'pending'; delete record.error;
        try { persist(account); } catch { record.delivery = 'failed'; warning('Local storage is unavailable. The message is kept.'); return; }
        notify(account); void launch(account, record);
      }
    };
  };
})();
