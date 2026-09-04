import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Mail, User, Building, Phone, Instagram, MapPin, CheckCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import TurnstileWidget, { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import { sendClientSignupWebhook } from "@/utils/sendWebhook";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { AuthShell } from "@/components/auth/AuthShell";

// Cores fixas (hex, nao tokens): a caixa de login e IDENTICA no claro e no escuro.
const INPUT_CLASS =
  "bg-white border-[#1668C1]/30 text-[#0B2545] placeholder:text-[#1668C1]/40 focus-visible:ring-[#1668C1]/30 focus-visible:border-[#1668C1]";

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupFullName, setSignupFullName] = useState("");
  const [signupCompanyName, setSignupCompanyName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupInstagram, setSignupInstagram] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupCep, setSignupCep] = useState("");

  // Validation states
  const [phoneValid, setPhoneValid] = useState(false);
  const [cepValid, setCepValid] = useState(false);

  // Captcha states
  const [loginCaptchaToken, setLoginCaptchaToken] = useState<string | null>(null);
  const [signupCaptchaToken, setSignupCaptchaToken] = useState<string | null>(null);
  const loginCaptchaRef = useRef<TurnstileWidgetHandle>(null);
  const signupCaptchaRef = useRef<TurnstileWidgetHandle>(null);

  // Phone mask: +55 (XX) 9 XXXX-XXXX
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return `+${numbers}`;
    if (numbers.length <= 4) return `+${numbers.slice(0, 2)} (${numbers.slice(2)}`;
    if (numbers.length <= 5) return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4)}`;
    if (numbers.length <= 9) return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4, 5)} ${numbers.slice(5)}`;
    return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4, 5)} ${numbers.slice(5, 9)}-${numbers.slice(9, 13)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setSignupPhone(formatted);
    // Validate: +55 (XX) 9 XXXX-XXXX = 19 chars
    const numbers = formatted.replace(/\D/g, "");
    setPhoneValid(numbers.length === 13);
  };

  // CEP mask: XXXXX-XXX
  const formatCep = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCep(e.target.value);
    setSignupCep(formatted);
    const numbers = formatted.replace(/\D/g, "");
    setCepValid(numbers.length === 8);
  };

  const isSignupValid = () => {
    return (
      signupFullName.trim().length > 2 &&
      signupCompanyName.trim().length > 2 &&
      signupEmail.includes("@") &&
      phoneValid &&
      cepValid
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginCaptchaToken) {
      toast.error("Por favor, complete a verificação de segurança (Captcha)");
      return;
    }

    setIsLoading(true);

    try {
      // Verify Captcha (Skip on Dev/Localhost to avoid secret key mismatch with test token)
      if (!import.meta.env.DEV) {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-turnstile', {
          body: { token: loginCaptchaToken }
        });

        if (verifyError || !verifyData?.success) {
          toast.error("Falha na verificação de segurança. Tente novamente.");
          setIsLoading(false);
          // Token expirado/consumido — gera um novo desafio (tokens são de uso único)
          setLoginCaptchaToken(null);
          loginCaptchaRef.current?.reset();
          return;
        }
      }

      await signIn(loginEmail, loginPassword);
    } catch (error) {
      console.error("Login Error:", error);
      toast.error("Erro ao realizar login");
      // O token do captcha já foi consumido pela verificação bem-sucedida —
      // sem reset, a próxima tentativa falharia com "timeout-or-duplicate"
      setLoginCaptchaToken(null);
      loginCaptchaRef.current?.reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSignupValid()) {
      toast.error("Por favor, preencha todos os campos corretamente");
      return;
    }

    if (!signupCaptchaToken) {
      toast.error("Por favor, complete a verificação de segurança (Captcha)");
      return;
    }

    setIsLoading(true);

    try {
      // Verify Captcha (Skip on Dev/Localhost)
      if (!import.meta.env.DEV) {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-turnstile', {
          body: { token: signupCaptchaToken }
        });

        if (verifyError || !verifyData?.success) {
          // Token expirado/consumido — gera um novo desafio (tokens são de uso único)
          setSignupCaptchaToken(null);
          signupCaptchaRef.current?.reset();
          throw new Error("Falha na verificação de segurança. Tente novamente.");
        }
      }

      // Insert into pending_signups table (not profiles - to avoid FK constraint)
      const { error } = await supabase
        .from("pending_signups")
        .insert({
          full_name: signupFullName.trim(),
          company_name: signupCompanyName.trim(),
          email: signupEmail.toLowerCase().trim(),
          phone: signupPhone,
          instagram: signupInstagram.trim(),
          address: `${signupAddress.trim()} - CEP: ${signupCep}`,
          status: "pendente"
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Este email já está cadastrado");
        } else {
          toast.error("Erro ao criar cadastro: " + error.message);
        }
        // O token já foi consumido na verificação — gera um novo para o retry
        setSignupCaptchaToken(null);
        signupCaptchaRef.current?.reset();
        return;
      }

      // Manda o e-mail de confirmação (falhar aqui não invalida o cadastro:
      // o time comercial ainda vê o pedido no super admin)
      supabase.functions
        .invoke("signup-confirm", {
          body: { action: "request", email: signupEmail.toLowerCase().trim() },
        })
        .catch((err) => console.error("Confirmation email error:", err));

      // Successfully inserted - send webhook with form data
      try {
        sendClientSignupWebhook({
          id: "pending", // Will be assigned by database
          full_name: signupFullName.trim(),
          company_name: signupCompanyName.trim(),
          email: signupEmail.toLowerCase().trim(),
          phone: signupPhone,
          instagram: signupInstagram.trim(),
          address: `${signupAddress.trim()} - CEP: ${signupCep}`,
          status: "pendente",
          created_at: new Date().toISOString(),
        }).catch(() => {
          // Silently fail - signup was successful
        });
      } catch {
        // Ignore any sync errors
      }

      setSignupSuccess(true);
      toast.success("Cadastro enviado com sucesso!");

    } catch (error: any) {
      console.error("Signup error:", error);
      toast.error(error.message || "Erro ao enviar cadastro");
    } finally {
      setIsLoading(false);
    }
  };

  // Success state after signup
  if (signupSuccess) {
    return (
      <AuthShell>
        <div className="w-full max-w-md">
          <Card className="w-full border border-[#1668C1]/15 bg-white shadow-[0_25px_60px_-15px_rgba(11,45,90,0.45)]">
            <CardContent className="pt-8 pb-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-[#1668C1] mb-2">Cadastro Enviado!</h2>
              <p className="text-[#1668C1]/80 mb-6">
                Enviamos um e-mail para confirmar o seu endereço. Clique no link da
                mensagem para validar o cadastro — depois disso nosso time de
                implementação entra em contato para liberar o seu acesso.
              </p>
              <Button
                onClick={() => setSignupSuccess(false)}
                variant="outline"
                className="border-[#1668C1]/40 bg-white text-[#1668C1] hover:bg-[#1668C1]/10 hover:text-[#1668C1]"
              >
                Voltar ao Login
              </Button>
            </CardContent>
          </Card>
          <p className="mt-4 text-center text-xs font-light text-[#1668C1]">
            2026 Clinbia | Todos os direitos reservados.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md">
      <Card className="w-full border border-[#1668C1]/15 bg-white shadow-[0_25px_60px_-15px_rgba(11,45,90,0.45)]">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto mb-2">
            <img
              src="/logo-light.png"
              alt="Clinbia"
              className="h-11 w-auto object-contain"
            />
          </div>
          <CardDescription className="text-[#1668C1] text-base">
            Atendimento e Gestão de Leads com IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-[#1668C1]/10 border border-[#1668C1]/20 mb-6">
              <TabsTrigger
                value="login"
                className="data-[state=active]:bg-[#1668C1] data-[state=active]:text-white text-[#1668C1] transition-all"
              >
                Login
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="data-[state=active]:bg-[#1668C1] data-[state=active]:text-white text-[#1668C1] transition-all"
              >
                Cadastro
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-[#1668C1]">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className={`pl-9 ${INPUT_CLASS}`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-[#1668C1]">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className={`pl-9 pr-10 ${INPUT_CLASS}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#1668C1]/60 transition-colors hover:text-[#1668C1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1668C1]/40"
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <ForgotPasswordDialog />
                </div>
                <div className="flex justify-center">
                  <TurnstileWidget ref={loginCaptchaRef} onVerify={setLoginCaptchaToken} onExpire={() => setLoginCaptchaToken(null)} />
                </div>
                {/* +30% na fonte e +10% no padding vertical do botao (h-auto libera o py) */}
                <Button
                  type="submit"
                  className="w-full h-auto py-[0.55rem] text-[1.1375rem] bg-[#1668C1] hover:bg-[#12539C] text-white font-semibold shadow-lg shadow-[#1668C1]/25 transition-all hover:scale-[1.02]"
                  disabled={isLoading}
                >
                  {isLoading ? "Entrando..." : "Avançar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-2 md:space-y-3">
                {/* Nome */}
                <div className="space-y-1">
                  <Label htmlFor="signup-name" className="text-[#1668C1] text-sm">Nome completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="João Silva"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      required
                      className={`pl-9 h-9 ${INPUT_CLASS}`}
                    />
                  </div>
                </div>

                {/* Nome da Empresa */}
                <div className="space-y-1">
                  <Label htmlFor="signup-company" className="text-[#1668C1] text-sm">Nome da Empresa *</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Empresa LTDA"
                      value={signupCompanyName}
                      onChange={(e) => setSignupCompanyName(e.target.value)}
                      required
                      className={`pl-9 h-9 ${INPUT_CLASS}`}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <Label htmlFor="signup-email" className="text-[#1668C1] text-sm">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      className={`pl-9 h-9 ${INPUT_CLASS}`}
                    />
                  </div>
                </div>

                {/* Telefone */}
                <div className="space-y-1">
                  <Label htmlFor="signup-phone" className="text-[#1668C1] text-sm">Telefone *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="+55 (11) 9 1234-5678"
                      value={signupPhone}
                      onChange={handlePhoneChange}
                      required
                      className={`pl-9 h-9 ${INPUT_CLASS} ${signupPhone && !phoneValid ? "border-red-500" : ""
                        } ${phoneValid ? "border-green-500" : ""}`}
                    />
                  </div>
                </div>

                {/* Instagram */}
                <div className="space-y-1">
                  <Label htmlFor="signup-instagram" className="text-[#1668C1] text-sm">Instagram</Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-2.5 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="signup-instagram"
                      type="text"
                      placeholder="@seuinstagram"
                      value={signupInstagram}
                      onChange={(e) => setSignupInstagram(e.target.value)}
                      className={`pl-9 h-9 ${INPUT_CLASS}`}
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div className="space-y-1">
                  <Label htmlFor="signup-address" className="text-[#1668C1] text-sm">Endereço *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-[#1668C1]/60" />
                    <Input
                      id="signup-address"
                      type="text"
                      placeholder="Rua Example, 123"
                      value={signupAddress}
                      onChange={(e) => setSignupAddress(e.target.value)}
                      required
                      className={`pl-9 h-9 ${INPUT_CLASS}`}
                    />
                  </div>
                </div>

                {/* CEP */}
                <div className="space-y-1">
                  <Label htmlFor="signup-cep" className="text-[#1668C1] text-sm">CEP *</Label>
                  <Input
                    id="signup-cep"
                    type="text"
                    placeholder="12345-678"
                    value={signupCep}
                    onChange={handleCepChange}
                    required
                    maxLength={9}
                    className={`h-9 ${INPUT_CLASS} ${signupCep && !cepValid ? "border-red-500" : ""
                      } ${cepValid ? "border-green-500" : ""}`}
                  />
                </div>

                <div className="flex justify-center">
                  <TurnstileWidget ref={signupCaptchaRef} onVerify={setSignupCaptchaToken} onExpire={() => setSignupCaptchaToken(null)} />
                </div>

                <Button
                  type="submit"
                  className="w-full h-auto py-[0.55rem] text-[1.1375rem] bg-[#1668C1] hover:bg-[#12539C] text-white font-semibold shadow-lg shadow-[#1668C1]/25 transition-all hover:scale-[1.02] mt-4"
                  disabled={isLoading || !isSignupValid()}
                >
                  {isLoading ? "Enviando..." : "Enviar Cadastro"}
                </Button>

                <p className="text-[#1668C1]/70 text-xs text-center mt-2">
                  Seu cadastro será analisado e você receberá as credenciais por email.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs font-light text-[#1668C1]">
        2026 Clinbia | Todos os direitos reservados.
      </p>
      </div>
    </AuthShell>
  );
};

export default Auth;
