import { redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { listChannels, listClientChannels } from '@/features/messenger/queries';
import { Messenger } from '@/features/messenger/components/messenger';
import { de } from '@/lib/i18n/de';

export default async function ChatPage() {
  const { user, orgId } = await requireAgencyPage();
  const [channels, clientChannels] = await Promise.all([
    listChannels(orgId),
    listClientChannels(orgId),
  ]);

  // Jump straight into the first channel when one exists.
  if (channels.length > 0 && channels[0]) {
    redirect(`/app/chat/${channels[0].id}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{de.messenger.title}</h1>
      <Messenger
        channels={channels}
        clientChannels={clientChannels}
        activeChannel={null}
        initialMessages={[]}
        meId={user.id}
        meName={user.fullName ?? user.email}
      />
    </div>
  );
}
