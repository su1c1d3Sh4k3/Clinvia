import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Mail, User, Building, Phone, Instagram, MapPin, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

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
    setIsLoading(true);
    await signIn(loginEmail, loginPassword);
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSignupValid()) {
      toast.error("Por favor, preencha todos os campos corretamente");
      return;
    }

    setIsLoading(true);

    try {
      // Insert into pending_signups table (not profiles - to avoid FK constraint)
      const { error } = await supabase
        .from("pending_signups")
        .insert({
          full_name: signupFullName.trim(),
          company_name: signupCompanyName.trim(),
          email: signupEmail.trim().toLowerCase(),
          phone: signupPhone,
          instagram: signupInstagram.trim(),
          address: `${signupAddress.trim()} - CEP: ${signupCep}`,
          status: "pendente"
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Email já cadastrado no sistema");
        } else {
          throw error;
        }
        return;
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary via-secondary/90 to-tertiary p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[100px]" />
          <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-tertiary/30 blur-[100px]" />
        </div>

        <Card className="w-full max-w-md border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl relative z-10">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Cadastro Enviado!</h2>
            <p className="text-white/70 mb-6">
              Seu cadastro foi recebido e está aguardando aprovação.
              Você receberá as credenciais de acesso em breve.
            </p>
            <Button
              onClick={() => setSignupSuccess(false)}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary via-secondary/90 to-tertiary p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-tertiary/30 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-white/10 blur-[80px]" />
      </div>

      <Card className="w-full max-w-md border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto mb-2">
            <img
              src="/clinvia-logo-full.png"
              alt="Clinvia"
              className="h-10 w-auto object-contain"
            />
          </div>
          <CardDescription className="text-white/70 text-base">
            Atendimento e Gestão de Leads com IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/10 border border-white/10 mb-6">
              <TabsTrigger
                value="login"
                className="data-[state=active]:bg-white data-[state=active]:text-secondary text-white/70 hover:text-white transition-all"
              >
                Login
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="data-[state=active]:bg-white data-[state=active]:text-secondary text-white/70 hover:text-white transition-all"
              >
                Cadastro
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-white/90">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-white/90">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                  disabled={isLoading}
                >
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3">
                {/* Nome */}
                <div className="space-y-1">
                  <Label htmlFor="signup-name" className="text-white/90 text-sm">Nome completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="João Silva"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      required
                      className="pl-9 h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Nome da Empresa */}
                <div className="space-y-1">
                  <Label htmlFor="signup-company" className="text-white/90 text-sm">Nome da Empresa *</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Empresa LTDA"
                      value={signupCompanyName}
                      onChange={(e) => setSignupCompanyName(e.target.value)}
                      required
                      className="pl-9 h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <Label htmlFor="signup-email" className="text-white/90 text-sm">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      className="pl-9 h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Telefone */}
                <div className="space-y-1">
                  <Label htmlFor="signup-phone" className="text-white/90 text-sm">Telefone *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="+55 (11) 9 1234-5678"
                      value={signupPhone}
                      onChange={handlePhoneChange}
                      required
                      className={`pl-9 h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 ${signupPhone && !phoneValid ? "border-red-500/50" : ""
                        } ${phoneValid ? "border-green-500/50" : ""}`}
                    />
                  </div>
                </div>

                {/* Instagram */}
                <div className="space-y-1">
                  <Label htmlFor="signup-instagram" className="text-white/90 text-sm">Instagram</Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
                    <Input
                      id="signup-instagram"
                      type="text"
                      placeholder="@seuinstagram"
                      value={signupInstagram}
                      onChange={(e) => setSignupInstagram(e.target.value)}
                      className="pl-9 h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div className="space-y-1">
                  <Label htmlFor="signup-address" className="text-white/90 text-sm">Endereço *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
                    <Input
                      id="signup-address"
                      type="text"
                      placeholder="Rua Example, 123"
                      value={signupAddress}
                      onChange={(e) => setSignupAddress(e.target.value)}
                      required
                      className="pl-9 h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* CEP */}
                <div className="space-y-1">
                  <Label htmlFor="signup-cep" className="text-white/90 text-sm">CEP *</Label>
                  <Input
                    id="signup-cep"
                    type="text"
                    placeholder="12345-678"
                    value={signupCep}
                    onChange={handleCepChange}
                    required
                    maxLength={9}
                    className={`h-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 ${signupCep && !cepValid ? "border-red-500/50" : ""
                      } ${cepValid ? "border-green-500/50" : ""}`}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] mt-4"
                  disabled={isLoading || !isSignupValid()}
                >
                  {isLoading ? "Enviando..." : "Enviar Cadastro"}
                </Button>

                <p className="text-white/50 text-xs text-center mt-2">
                  Seu cadastro será analisado e você receberá as credenciais por email.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="absolute bottom-4 text-white/40 text-xs">
        © 2026 Clinbia. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Auth;
