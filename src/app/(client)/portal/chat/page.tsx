import { requireClientPage } from '@/lib/authz/page-guards';
import { getMyClientChannelThread } from '@/features/messenger/client-chat';
import { getMyAccountManager } from '@/features/account-manager/queries';
import { ClientChat } from '@/features/messenger/components/client-chat';

export const dynamic = 'force-dynamic';

export default async function PortalChatPage() {
  const { user } = await requireClientPage();
  const [thread, manager] = await Promise.all([
    getMyClientChannelThread(user.id),
    getMyAccountManager(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-sm text-muted-foreground">
          {manager
            ? `Direkt mit ${manager.name}, eurem Ansprechpartner.`
            : 'Direkt mit eurem Team.'}
        </p>
      </div>
      {thread ? (
        <ClientChat
          channelId={thread.channelId}
          initialMessages={thread.messages}
          meId={user.id}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Der Chat ist gerade nicht verfügbar. Bitte später erneut versuchen.
        </p>
      )}
    </div>
  );
}
