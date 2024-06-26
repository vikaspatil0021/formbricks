import OnboardingTitle from "@/app/(app)/onboarding/components/OnboardingTitle";
import InappMockup from "@/images/onboarding-in-app-survey.png";
import LinkMockup from "@/images/onboarding-link-survey.webp";
import Image from "next/image";

import { OptionCard } from "@formbricks/ui/OptionCard";

interface PathwaySelectProps {
  setSelectedPathway: (pathway: "link" | "website" | null) => void;
  setCurrentStep: (currentStep: number) => void;
  isFormbricksCloud: boolean;
}

type PathwayOptionType = "link" | "website";

export default function PathwaySelect({
  setSelectedPathway,
  setCurrentStep,
  isFormbricksCloud,
}: PathwaySelectProps) {
  const handleSelect = async (pathway: PathwayOptionType) => {
    if (pathway === "link") {
      localStorage.setItem("onboardingPathway", "link");
      if (isFormbricksCloud) {
        setCurrentStep(2);
        localStorage.setItem("onboardingCurrentStep", "2");
      } else {
        setCurrentStep(5);
        localStorage.setItem("onboardingCurrentStep", "5");
      }
    } else {
      localStorage.setItem("onboardingPathway", "website");
      setCurrentStep(2);
      localStorage.setItem("onboardingCurrentStep", "2");
    }
    setSelectedPathway(pathway);
  };

  return (
    <div className="space-y-16 p-6 text-center">
      <OnboardingTitle
        title="How would you like to start?"
        subtitle="You can always use all types of surveys later on."
      />
      <div className="flex space-x-8">
        <OptionCard
          cssId="onboarding-link-survey-card"
          size="lg"
          title="Link Surveys"
          description="Create a new survey and share a link."
          onSelect={() => {
            handleSelect("link");
          }}>
          <Image src={LinkMockup} alt="" height={350} />
        </OptionCard>
        <OptionCard
          cssId="onboarding-website-survey-card"
          size="lg"
          title="Website Surveys"
          description="Run a survey on a website."
          onSelect={() => {
            handleSelect("website");
          }}>
          <Image src={InappMockup} alt="" height={350} />
        </OptionCard>
      </div>
    </div>
  );
}
