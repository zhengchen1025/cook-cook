import React from 'react';
import RecipeCard from './RecipeCard';

const RecipeList = ({ 
  recipes, 
  expanded, 
  attemptForms, 
  toggleExpand, 
  chooseBestAttempt,
  onAttemptFileSelected,
  removeAttemptImage,
  submitAttempt,
  setAttemptFormState,
  PREVIEW_SIZE,
  onDeleteRecipe
}) => {
  return (
    <div className="space-y-6">
      {recipes.map((recipe) => {
        const ex = expanded[recipe.id] || {
          open: false,
          loading: false,
          attempts: [],
          error: null,
          choosing: null,
          choosingError: null,
        };
        const attemptForm = attemptForms[recipe.id] || {
          body: "",
          feedback: "",
          previewDataUrl: null,
          processingFiles: false,
          submitting: false,
          errors: {},
        };

        return (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            expanded={expanded}
            attemptForm={attemptForm}
            toggleExpand={toggleExpand}
            chooseBestAttempt={chooseBestAttempt}
            onAttemptFileSelected={onAttemptFileSelected}
            removeAttemptImage={removeAttemptImage}
            submitAttempt={submitAttempt}
            setAttemptFormState={setAttemptFormState}
            PREVIEW_SIZE={PREVIEW_SIZE}
            onDeleteRecipe={onDeleteRecipe}
          />
        );
      })}
    </div>
  );
};

export default RecipeList;