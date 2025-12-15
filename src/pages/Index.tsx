import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConversationsList } from "@/components/ConversationsList";
import { ChatArea } from "@/components/ChatArea";
import { AIIntelligenceSidebar } from "@/components/AIIntelligenceSidebar";
import { NewMessageModal } from "@/components/NewMessageModal";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Menu, X, MoreVertical, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMobileMenu } from "@/contexts/MobileMenuContext";

// Mobile view states
type MobileView = "list" | "chat";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const { setHideFloatingButton } = useMobileMenu();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);

  // New Message Modal State
  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [prefilledPhone, setPrefilledPhone] = useState("");

  // Follow Up Message State (to inject into ChatArea textarea)
  const [followUpMessage, setFollowUpMessage] = useState("");

  // Mobile navigation states
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [isActionsSheetOpen, setIsActionsSheetOpen] = useState(false);

  const handleOpenNewMessage = (phone?: string) => {
    if (phone) setPrefilledPhone(phone);
    setIsNewMessageOpen(true);
  };

  // Handle conversation selection - switch to chat view on mobile
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileView("chat");
  };

  // Handle back to list on mobile
  const handleBackToList = () => {
    setMobileView("list");
  };

  // Control floating button visibility based on mobile view
  useEffect(() => {
    setHideFloatingButton(mobileView === "chat");
  }, [mobileView, setHideFloatingButton]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Handle conversation selection from URL (by conversationId or contactId)
  useEffect(() => {
    const conversationId = searchParams.get("conversationId");
    const contactId = searchParams.get("contact");
    const messageParam = searchParams.get("message");

    if (conversationId) {
      setSelectedConversationId(conversationId);
      setMobileView("chat");
    } else if (contactId) {
      // Find conversation by contact_id - ONLY open or pending
      const findOrCreateConversationByContact = async () => {
        // First try to find an open or pending conversation
        const { data: conversations } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contactId)
          .in("status", ["open", "pending"])
          .order("created_at", { ascending: false })
          .limit(1);

        if (conversations && conversations.length > 0) {
          console.log("Found existing open/pending conversation:", conversations[0].id);
          setSelectedConversationId(conversations[0].id);
          setMobileView("chat");
        } else {
          // No open/pending conversation - create a new one
          console.log("No open/pending conversation found, creating new one...");

          const { data: { user: currentUser } } = await supabase.auth.getUser();

          const { data: newConv, error: createError } = await supabase
            .from("conversations")
            .insert({
              contact_id: contactId,
              status: "open",
              assigned_agent_id: currentUser?.id || null,
              unread_count: 0,
              last_message_at: new Date().toISOString()
            })
            .select("id")
            .single();

          if (createError) {
            console.error("Error creating conversation:", createError);
          } else if (newConv) {
            console.log("Created new conversation:", newConv.id);
            setSelectedConversationId(newConv.id);
            setMobileView("chat");
          }
        }
      };
      findOrCreateConversationByContact();
    }

    // Pre-fill message if present
    if (messageParam) {
      setFollowUpMessage(decodeURIComponent(messageParam));
    }
  }, [searchParams]);

  // Reset search when conversation changes
  useEffect(() => {
    setSearchTerm("");
    setCurrentMatchIndex(0);
    setTotalMatches(0);
  }, [selectedConversationId]);

  // Fetch conversation details to check if it's a group
  const { data: conversation } = useQuery({
    queryKey: ["conversation-check-group", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return null;
      const { data, error } = await supabase
        .from("conversations")
        .select("group_id")
        .eq("id", selectedConversationId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!selectedConversationId,
  });

  const isGroupConversation = !!conversation?.group_id;

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Layout - Original */}
      <div className="hidden md:flex h-screen w-full">
        <ConversationsList
          onSelectConversation={setSelectedConversationId}
          selectedId={selectedConversationId}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          currentMatchIndex={currentMatchIndex}
          setCurrentMatchIndex={setCurrentMatchIndex}
          totalMatches={totalMatches}
          onOpenNewMessage={handleOpenNewMessage}
        />
        <ChatArea
          conversationId={selectedConversationId}
          searchTerm={searchTerm}
          currentMatchIndex={currentMatchIndex}
          setTotalMatches={setTotalMatches}
          onOpenNewMessage={handleOpenNewMessage}
          externalMessage={followUpMessage}
          clearExternalMessage={() => setFollowUpMessage("")}
        />
        <AIIntelligenceSidebar
          conversationId={selectedConversationId}
          onFollowUpMessageClick={setFollowUpMessage}
          onOpportunitySelect={(conversationId, message) => {
            console.log("Opportunity selected - conversationId:", conversationId, "message:", message);
            setSelectedConversationId(conversationId);
            setFollowUpMessage(message);
          }}
        />
      </div>

      {/* Mobile Layout */}
      <div className="flex md:hidden h-screen w-full flex-col overflow-hidden">
        {/* Mobile: Conversations List View */}
        <div className={cn(
          "h-full w-full transition-transform duration-300 ease-in-out overflow-hidden",
          mobileView === "list" ? "translate-x-0" : "-translate-x-full absolute"
        )}>
          <ConversationsList
            onSelectConversation={handleSelectConversation}
            selectedId={selectedConversationId}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            currentMatchIndex={currentMatchIndex}
            setCurrentMatchIndex={setCurrentMatchIndex}
            totalMatches={totalMatches}
            onOpenNewMessage={handleOpenNewMessage}
          />
        </div>

        {/* Mobile: Chat View */}
        <div className={cn(
          "h-full w-full flex flex-col transition-transform duration-300 ease-in-out",
          mobileView === "chat" ? "translate-x-0" : "translate-x-full absolute"
        )}>
          {/* Mobile Chat Header */}
          <div className="flex items-center justify-between p-2 border-b bg-background/95 backdrop-blur-sm z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToList}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <span className="font-medium text-sm truncate flex-1 text-center">
              Conversa
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsActionsSheetOpen(true)}
              className="h-9 w-9"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>

          {/* Chat Area - Full height minus header */}
          <div className="flex-1 overflow-hidden">
            <ChatArea
              conversationId={selectedConversationId}
              searchTerm={searchTerm}
              currentMatchIndex={currentMatchIndex}
              setTotalMatches={setTotalMatches}
              onOpenNewMessage={handleOpenNewMessage}
              externalMessage={followUpMessage}
              clearExternalMessage={() => setFollowUpMessage("")}
              isMobile={true}
            />
          </div>
        </div>

        {/* Mobile: Actions Sheet (Right Sidebar Content) */}
        <Sheet open={isActionsSheetOpen} onOpenChange={setIsActionsSheetOpen}>
          <SheetContent side="right" className="w-[85vw] max-w-[350px] p-0 overflow-y-auto">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-left">Ações</SheetTitle>
            </SheetHeader>
            <div className="p-0">
              <AIIntelligenceSidebar
                conversationId={selectedConversationId}
                onFollowUpMessageClick={(message) => {
                  setFollowUpMessage(message);
                  setIsActionsSheetOpen(false);
                }}
                onOpportunitySelect={(conversationId, message) => {
                  setSelectedConversationId(conversationId);
                  setFollowUpMessage(message);
                  setIsActionsSheetOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <NewMessageModal
        open={isNewMessageOpen}
        onOpenChange={setIsNewMessageOpen}
        prefilledPhone={prefilledPhone}
      />
    </div>
  );
};

export default Index;

