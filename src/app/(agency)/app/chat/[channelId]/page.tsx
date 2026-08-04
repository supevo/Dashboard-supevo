import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  listChannels,
  listClientChannels,
  getChannel,
  listChannelMessages,
} from '@/features/messenger/queries';
import { Messenger } from '@/features/messenger/components/messenger';
import { de } from '@/lib/i18n/de';

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const { user, orgId } = await requireAgencyPage();

  const [channels, clientChannels, channel] = await Promise.all([
    listChannels(orgId),
    listClientChannels(orgId),
    getChannel(channelId),
  ]);
  if (!channel) notFound();

  const messages = await listChannelMessages(channelId, user.id);

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
