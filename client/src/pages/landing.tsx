import { Languages, ArrowRight, Zap, Users, Brain, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Landing() {
  const handleLogin = () => {
    window.location.href = '/api/login';
  };

  const features = [
    {
      icon: <Brain className="h-8 w-8" />,
      title: "AI-Powered Analysis",
      description: "Advanced linguistic processing with Google Gemini AI for deep text analysis and insights."
    },
    {
      icon: <Languages className="h-8 w-8" />,
      title: "Multi-Language Support",
      description: "Support for Spanish, Greek, and expanding language coverage with Universal Dependencies standards."
    },
    {
      icon: <BarChart3 className="h-8 w-8" />,
      title: "Real-Time Processing",
      description: "Fast batch processing with live progress tracking and comprehensive analytics."
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Research-Grade Accuracy",
      description: "Professional-grade POS tagging, frequency analysis, and contextual information extraction."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Languages className="h-12 w-12 text-primary" />
            </div>
          </div>
          
          <h1 className="text-5xl font-bold text-foreground mb-6 leading-tight">
            Advanced Linguistic
            <span className="text-primary"> Analysis Platform</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            Your personal linguistic analysis workspace. Each user gets their own private account with 
            isolated databases, word lists, and analysis data. Start building your personal library today.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Button 
              onClick={handleLogin}
              size="lg" 
              className="px-8 py-4 text-lg font-semibold"
              data-testid="login-button"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            
            <Button 
              variant="outline" 
              size="lg" 
              className="px-8 py-4 text-lg"
              onClick={() => window.location.href = '/demo'}
              data-testid="view-demo-button"
            >
              See Multi-User Demo
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
          {features.map((feature, index) => (
            <Card key={index} className="text-center border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-primary/10 rounded-lg text-primary">
                    {feature.icon}
                  </div>
                </div>
                <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Use Cases Section */}
        <div className="text-center mb-20">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Your Personal Linguistic Workspace
          </h2>
          <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto">
            Each user gets their own secure account with private databases, personalized word tracking, 
            and isolated analysis data. Perfect for researchers, educators, and language learners.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-card rounded-xl border shadow-sm">
              <h3 className="text-xl font-semibold mb-3">Personal Database Library</h3>
              <p className="text-muted-foreground">
                Each user maintains their own private collection of linguistic databases that nobody else can access.
              </p>
            </div>
            <div className="p-6 bg-card rounded-xl border shadow-sm">
              <h3 className="text-xl font-semibold mb-3">Individual Word Tracking</h3>
              <p className="text-muted-foreground">
                Track your personal learning progress with known words lists that are unique to your account.
              </p>
            </div>
            <div className="p-6 bg-card rounded-xl border shadow-sm">
              <h3 className="text-xl font-semibold mb-3">Secure Data Isolation</h3>
              <p className="text-muted-foreground">
                Your texts, analysis data, and word lists are completely private and isolated from other users.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-primary/5 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Create Your Personal Account Today
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join users worldwide who have their own private linguistic analysis workspace with secure data isolation.
          </p>
          <Button 
            onClick={handleLogin}
            size="lg" 
            className="px-8 py-4 text-lg font-semibold"
            data-testid="cta-login-button"
          >
            Start Analyzing Today
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}