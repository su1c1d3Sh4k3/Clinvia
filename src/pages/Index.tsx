import { NavigationSidebar } from "@/components/NavigationSidebar";
import { ConversationsList } from "@/components/ConversationsList";
import { ChatArea } from "@/components/ChatArea";
import { AIIntelligenceSidebar } from "@/components/AIIntelligenceSidebar";

const Index = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <NavigationSidebar />
      <ConversationsList />
      <ChatArea />
      <AIIntelligenceSidebar />
    </div>
  );
};

export default Index;
