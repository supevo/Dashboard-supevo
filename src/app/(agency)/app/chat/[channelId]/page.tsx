import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  listChannels,
  listClientChannels,
  getChannel,
  listChannelMessages,
  getUnreadCounts,
} from '@/features/messenger/queries';
import { markChannelRead } from '@/features/messenger/actions';
import { Messenger } from '@/features/messenger/components/messenger';
import { de } from '@/lib/i18n/de';

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const { user, orgId } = await requireAgencyPage();

  const [channels, clientChannels, channel, unreadCounts] = await Promise.all([
    listChannels(orgId),
    listClientChannels(orgId),
    getChannel(channelId),
    getUnreadCounts(),
  ]);
  if (!channel) notFound();

  const messages = await listChannelMessages(channelId, user.id);
  // Opening a channel marks it read; drop its badge from the sidebar snapshot.
  await markChannelRead(channelId);
  delete unreadCounts[channelId];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{de.messenger.title}</h1>
      <Messenger
        channels={channels}
        clientChannels={clientChannels}
        activeChannel={channel}
        initialMessages={messages}
        meId={user.id}
        meName={user.fullName ?? user.email}
      />
    </div>
  );
}
